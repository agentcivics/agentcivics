/**
 * sui-compat.mjs — gRPC-backed shim presenting the JSON-RPC SuiClient surface.
 *
 * Sui deprecated JSON-RPC on public fullnodes; every read in this server used to
 * go through `@mysten/sui/client`'s SuiClient and now fails with
 * "Method not found. JSON-RPC on public fullnodes has been deprecated."
 *
 * Rather than rewrite ~2,100 lines of call sites and response handling, this
 * module reimplements the six SuiClient methods index.mjs actually uses on top
 * of SuiGrpcClient, mapping gRPC responses back into the JSON-RPC shapes the
 * existing code already knows how to read.
 *
 * Covered: getObject, getOwnedObjects, getCoins, getBalance, queryEvents,
 * getTransactionBlock, waitForTransaction, devInspectTransactionBlock,
 * signAndExecuteTransaction. Anything else is intentionally absent — an
 * unimplemented method should fail loudly rather than silently return undefined.
 *
 * Requires @mysten/sui >= 2.23: grpcClient.listEvents (used by queryEvents) does
 * not exist in 2.16, so a looser floor would resolve to a version where event
 * queries throw at runtime rather than at install time.
 *
 * Also used by workers/ (the hosted read-only MCP and the gas sponsor), which
 * is why getCoins lives here even though index.mjs has no caller for it.
 * Callers that need to build a Transaction should pass the underlying modern
 * client exposed as `.grpc` — the shim itself is not a valid build target.
 */
import { SuiGrpcClient } from "@mysten/sui/grpc";

// `getFullnodeUrl` was removed in @mysten/sui 2.x. The gRPC service is served
// from the same hostnames as the old JSON-RPC endpoints.
const FULLNODE_URLS = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
  localnet: "http://127.0.0.1:9000",
};

export function getFullnodeUrl(network) {
  const url = FULLNODE_URLS[network];
  if (!url) throw new Error(`Unknown network '${network}'. Expected one of: ${Object.keys(FULLNODE_URLS).join(", ")}`);
  return url;
}

/**
 * gRPC returns owners as a discriminated union ({ $kind: "AddressOwner", AddressOwner: "0x.." }).
 * JSON-RPC used a bare single-key object. Strip $kind so downstream output matches
 * what callers of agentcivics_get_agent have always seen.
 */
function toJsonRpcOwner(grpcOwner) {
  if (!grpcOwner) return null;
  const { $kind, ...rest } = grpcOwner;
  if ($kind === "Shared" && rest.Shared) {
    return { Shared: { initial_shared_version: rest.Shared.initialSharedVersion } };
  }
  if ($kind === "Immutable") return "Immutable";
  return rest;
}

/**
 * Rebuild the JSON-RPC `data` envelope from a gRPC object.
 *
 * Note the one real shape difference: gRPC's `json` renders Move structs flat
 * (a UID is "0x..", not { id: "0x.." }; a nested struct is a plain object, not
 * { type, fields }). Every field index.mjs reads is a flat scalar, so this is
 * transparent at the call sites we have — but a new caller reaching into a
 * nested struct should expect the flat form.
 */
function toJsonRpcObjectData(grpcObject) {
  if (!grpcObject) return null;
  return {
    objectId: grpcObject.objectId,
    version: grpcObject.version,
    digest: grpcObject.digest,
    type: grpcObject.type,
    owner: toJsonRpcOwner(grpcObject.owner),
    previousTransaction: grpcObject.previousTransaction ?? null,
    content: grpcObject.json
      ? { dataType: "moveObject", type: grpcObject.type, hasPublicTransfer: true, fields: grpcObject.json }
      : null,
  };
}

/**
 * execute/simulate return a discriminated union in @mysten/sui >= 2.17
 * ({ $kind: "Transaction", Transaction: {...} }) but the bare parsed transaction
 * in earlier 2.x. Unwrap either so the shim works across both.
 */
function unwrapTransactionResult(response) {
  if (!response) return null;
  if (response.$kind === "Transaction") return response.Transaction;
  if (response.$kind === "FailedTransaction") return response.FailedTransaction;
  return response;
}

/**
 * gRPC reports execution status as { success: boolean, error }, JSON-RPC as
 * { status: 'success' | 'failure', error }. Call sites test
 * `effects.status.status !== 'success'`, so a raw gRPC status reads as failure
 * on a transaction that actually succeeded. Expose the JSON-RPC shape and keep
 * the gRPC fields alongside it.
 */
function toJsonRpcEffects(effects) {
  if (!effects) return effects;
  const succeeded = effects.status?.success !== false;
  return {
    ...effects,
    status: {
      ...effects.status,
      status: succeeded ? 'success' : 'failure',
      ...(succeeded ? {} : { error: effects.status?.error?.message ?? 'Transaction failed' }),
    },
  };
}

/** effects.changedObjects + objectTypes → the JSON-RPC objectChanges array. */
function toJsonRpcObjectChanges(executeResult) {
  const changed = executeResult?.effects?.changedObjects;
  if (!Array.isArray(changed)) return [];
  const typesById = executeResult.objectTypes ?? {};
  const idOperationToChangeType = { Created: "created", Deleted: "deleted", None: "mutated" };
  return changed.map((change) => ({
    type: idOperationToChangeType[change.idOperation] ?? "mutated",
    objectId: change.objectId,
    objectType: typesById[change.objectId] ?? null,
    version: change.outputVersion,
    digest: change.outputDigest,
    owner: toJsonRpcOwner(change.outputOwner),
  }));
}

export function createSuiCompatClient({ url }) {
  const grpcClient = new SuiGrpcClient({ baseUrl: url });

  return {
    /** Escape hatch for anything that wants the modern client directly. */
    grpc: grpcClient,

    async getObject({ id, options = {} }) {
      const response = await grpcClient.getObject({
        objectId: id,
        include: { json: options.showContent !== false, previousTransaction: true },
      });
      return { data: toJsonRpcObjectData(response?.object) };
    },

    async getOwnedObjects({ owner, filter, options = {}, cursor, limit }) {
      const response = await grpcClient.listOwnedObjects({
        owner,
        type: filter?.StructType,
        cursor: cursor ?? undefined,
        limit,
        include: { json: options.showContent !== false },
      });
      return {
        data: (response.objects ?? []).map((object) => ({ data: toJsonRpcObjectData(object) })),
        nextCursor: response.cursor,
        hasNextPage: response.hasNextPage,
      };
    },

    async getCoins({ owner, coinType, cursor, limit }) {
      const response = await grpcClient.listCoins({
        owner,
        coinType,
        cursor: cursor ?? undefined,
        limit,
      });
      return {
        data: (response.objects ?? []).map((coin) => ({
          coinObjectId: coin.objectId,
          version: coin.version,
          digest: coin.digest,
          balance: coin.balance,
          coinType: coin.type,
        })),
        nextCursor: response.cursor,
        hasNextPage: response.hasNextPage,
      };
    },

    /**
     * suix_queryEvents. Retention caveat carried over from JSON-RPC: public
     * fullnodes keep only a short window of event history, so an empty result
     * means "nothing recent", not "never happened". Callers that need the full
     * population should read objects instead.
     */
    async queryEvents({ query, cursor, limit = 50 }) {
      const response = await grpcClient.listEvents({
        filter: query?.MoveEventType
          ? { eventType: query.MoveEventType }
          : { emitModule: query?.MoveEventModule
              ? `${query.MoveEventModule.package}::${query.MoveEventModule.module}`
              : undefined },
        cursor: cursor ?? undefined,
        limit,
      });
      return {
        data: (response.events ?? []).map((event) => ({
          type: event.eventType,
          packageId: event.packageId,
          transactionModule: event.module,
          sender: event.sender,
          parsedJson: event.json,
          timestampMs: event.timestampMs ?? null,
          id: { txDigest: event.transactionDigest, eventSeq: String(event.eventIndex ?? 0) },
        })),
        hasNextPage: response.hasNextPage ?? false,
        nextCursor: response.endCursor ?? null,
      };
    },

    /** sui_getTransactionBlock. Only the `showInput` shape callers here read. */
    async getTransactionBlock({ digest, options = {} }) {
      const response = await grpcClient.getTransaction({
        digest,
        include: { transaction: options.showInput !== false, effects: options.showEffects === true },
      });
      const parsed = unwrapTransactionResult(response);
      return {
        digest: parsed?.digest,
        transaction: parsed?.transaction
          ? { data: { sender: parsed.transaction.sender, gasData: parsed.transaction.gasData } }
          : null,
        effects: toJsonRpcEffects(parsed?.effects),
      };
    },

    async waitForTransaction({ digest, timeout, pollInterval }) {
      const waited = unwrapTransactionResult(
        await grpcClient.waitForTransaction({ digest, timeout, pollInterval }),
      );
      return waited ? { ...waited, effects: toJsonRpcEffects(waited.effects) } : waited;
    },

    async getBalance({ owner, coinType }) {
      const response = await grpcClient.getBalance({ owner, coinType });
      return {
        coinType: response.balance?.coinType,
        totalBalance: response.balance?.balance ?? "0",
      };
    },

    /**
     * devInspect → simulateTransaction. Call sites read
     * `results[0].returnValues[0][0]` and test it with Array.isArray, so the
     * returned BCS bytes must be a plain number[], not a Uint8Array.
     */
    async devInspectTransactionBlock({ transactionBlock, sender }) {
      if (sender) transactionBlock.setSenderIfNotSet(sender);
      const response = await grpcClient.simulateTransaction({
        transaction: transactionBlock,
        include: { commandResults: true },
        // A read-only inspect from the zero address has no gas coins; the
        // balance/gas checks would reject it before the Move call ever runs.
        checksEnabled: false,
      });
      return {
        results: (response.commandResults ?? []).map((commandResult) => ({
          returnValues: (commandResult.returnValues ?? []).map((returnValue) => [
            Array.from(returnValue.bcs ?? []),
            "",
          ]),
        })),
        effects: unwrapTransactionResult(response)?.effects ?? null,
      };
    },

    async signAndExecuteTransaction({ signer, transaction }) {
      transaction.setSenderIfNotSet(signer.toSuiAddress());
      const transactionBytes = await transaction.build({ client: grpcClient });
      const { signature } = await signer.signTransaction(transactionBytes);
      const executed = unwrapTransactionResult(
        await grpcClient.core.executeTransaction({
          transaction: transactionBytes,
          signatures: [signature],
          include: { effects: true, objectTypes: true },
        }),
      );
      if (executed?.status && executed.status.success === false) {
        throw new Error(`Transaction failed: ${executed.status.error?.message ?? "unknown error"}`);
      }
      return {
        digest: executed?.digest,
        effects: toJsonRpcEffects(executed?.effects),
        objectChanges: toJsonRpcObjectChanges(executed),
      };
    },
  };
}
