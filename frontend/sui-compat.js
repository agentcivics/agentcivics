/**
 * sui-compat.js — gRPC/GraphQL-backed shim presenting the JSON-RPC surface the dapp was written against.
 *
 * Sui disabled JSON-RPC on public fullnodes (mainnet the week of 2026-07-27; the
 * public testnet node answers every method with -32601 "JSON-RPC on public
 * fullnodes has been deprecated"). This file is the browser counterpart of
 * mcp-server/sui-compat.mjs: it reimplements only the calls index.html actually
 * makes, on top of SuiGrpcClient, and maps responses back into the JSON-RPC
 * shapes the existing call sites already know how to read.
 *
 * Two transports, because neither covers everything:
 *   - gRPC  — object reads, dynamic fields, simulate, execute, waitForTransaction.
 *   - GraphQL — listObjectsByType, which gRPC has no equivalent for (it can only
 *     list objects by *owner*). Agent browsing needs "every AgentIdentity", so it
 *     goes through GraphQL.
 *
 * One shape difference is NOT hidden, because hiding it is not possible: gRPC
 * renders Move structs flat. A UID is "0x..", not { id: "0x.." }; a nested struct
 * is a plain object, not { type, fields }; an Option is its value or null, not
 * { fields: { vec: [...] } }. Call sites were updated to read the flat form.
 * Re-nesting generically would require the type layout, which the flat JSON has
 * already discarded.
 */
import { SuiGrpcClient } from "https://esm.sh/@mysten/sui@2/grpc";
import { bcs } from "https://esm.sh/@mysten/sui@2/bcs";

export const FULLNODE_URL = "https://fullnode.testnet.sui.io:443";
export const GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql";

/**
 * Dynamic-field keys travel as BCS bytes over gRPC, where JSON-RPC took
 * { type, value }. Only the key types this dapp actually uses are supported —
 * an unknown type throws rather than silently encoding garbage that would come
 * back as an empty table lookup.
 */
function encodeFieldName(type, value) {
  if (type === "0x2::object::ID" || type === "address") {
    return bcs.Address.serialize(value).toBytes();
  }
  if (type === "0x1::string::String") {
    return bcs.string().serialize(value).toBytes();
  }
  if (type === "u64") return bcs.u64().serialize(value).toBytes();
  throw new Error(`sui-compat: unsupported dynamic field key type "${type}"`);
}

/** Inverse of encodeFieldName, for listDynamicFields which returns keys as bytes. */
function decodeFieldName(type, bytes) {
  if (!bytes) return null;
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const bare = String(type).replace(/^0x0+/, "0x");
  if (bare.endsWith("::object::ID") || bare === "address") return bcs.Address.parse(u8);
  if (bare.endsWith("::string::String")) return bcs.string().parse(u8);
  if (bare === "u64") return bcs.u64().parse(u8).toString();
  return null;
}

/** gRPC owners are a discriminated union; JSON-RPC used a bare single-key object. */
function toJsonRpcOwner(grpcOwner) {
  if (!grpcOwner) return null;
  const { $kind, ...rest } = grpcOwner;
  if ($kind === "Shared" && rest.Shared) {
    return { Shared: { initial_shared_version: rest.Shared.initialSharedVersion } };
  }
  if ($kind === "Immutable") return "Immutable";
  return rest;
}

/** Rebuild the JSON-RPC `data` envelope from a gRPC object. */
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

/** execute/simulate return a discriminated union in @mysten/sui >= 2.17. */
function unwrapTransactionResult(response) {
  if (!response) return null;
  if (response.$kind === "Transaction") return response.Transaction;
  if (response.$kind === "FailedTransaction") return response.FailedTransaction;
  return response;
}

async function graphqlQuery(url, query, variables) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (body.errors?.length) throw new Error(`GraphQL: ${body.errors[0].message}`);
  return body.data;
}

export function createSuiCompatClient({ url = FULLNODE_URL, graphqlUrl = GRAPHQL_URL } = {}) {
  const grpcClient = new SuiGrpcClient({ baseUrl: url });

  return {
    /** Escape hatch — Transaction.build() needs a real modern client. */
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

    /**
     * suix_getDynamicFieldObject. gRPC's getDynamicField returns only field
     * metadata, so the value comes from a second getObject on the field id —
     * which yields { id, name, value } and slots straight into the
     * `.data.content.fields.value` the call sites already read.
     */
    async getDynamicFieldObject({ parentId, name }) {
      const field = await grpcClient.getDynamicField({
        parentId,
        name: { type: name.type, bcs: encodeFieldName(name.type, name.value) },
      });
      const fieldId = field?.dynamicField?.fieldId;
      if (!fieldId) return { data: null };
      const object = await grpcClient.getObject({ objectId: fieldId, include: { json: true } });
      return { data: toJsonRpcObjectData(object?.object) };
    },

    /** suix_getDynamicFields. Keys arrive as BCS bytes and are decoded back to values. */
    async getDynamicFields({ parentId, cursor, limit }) {
      const response = await grpcClient.listDynamicFields({
        parentId,
        cursor: cursor ?? undefined,
        limit,
        include: { value: false },
      });
      return {
        data: (response.dynamicFields ?? []).map((field) => ({
          objectId: field.fieldId,
          type: field.type,
          name: {
            type: field.name?.type,
            value: decodeFieldName(field.name?.type, field.name?.bcs),
          },
        })),
        nextCursor: response.cursor,
        hasNextPage: response.hasNextPage,
      };
    },

    /**
     * suix_queryEvents. Note the retention caveat: the public fullnode keeps only
     * a short window of event history, so this returns recent events only. Views
     * that need the full population read objects instead (see listObjectsByType).
     */
    async queryEvents({ query, limit = 50 }) {
      const response = await grpcClient.listEvents({
        filter: query?.MoveEventType
          ? { eventType: query.MoveEventType }
          : { emitModule: query?.MoveModule ? `${query.MoveModule.package}::${query.MoveModule.module}` : undefined },
        limit,
      });
      return {
        data: (response.events ?? []).map((event) => ({
          type: event.eventType,
          packageId: event.packageId,
          transactionModule: event.module,
          sender: event.sender,
          parsedJson: event.json,
          id: { txDigest: event.transactionDigest, eventSeq: String(event.eventIndex ?? 0) },
          checkpoint: event.checkpoint,
        })),
        hasNextPage: response.hasNextPage ?? false,
        nextCursor: response.endCursor ?? null,
      };
    },

    /**
     * Every object of a Move type, newest first. gRPC can only list by owner, so
     * this goes through GraphQL. Unlike an event query it reads live state, so it
     * is unaffected by the fullnode's event-retention window.
     */
    async listObjectsByType(type, limit = 50) {
      const data = await graphqlQuery(
        graphqlUrl,
        `query ObjectsByType($type: String!, $first: Int!) {
           objects(filter: { type: $type }, first: $first) {
             nodes { address version asMoveObject { contents { type { repr } json } } }
           }
         }`,
        { type, first: limit },
      );
      return (data?.objects?.nodes ?? []).map((node) => ({
        objectId: node.address,
        version: node.version,
        type: node.asMoveObject?.contents?.type?.repr,
        content: node.asMoveObject?.contents?.json
          ? { dataType: "moveObject", fields: node.asMoveObject.contents.json }
          : null,
      }));
    },

    /**
     * devInspect → simulateTransaction. Call sites read
     * `results[0].returnValues[0][0]` and test it with Array.isArray, so the BCS
     * bytes must be a plain number[], not a Uint8Array.
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

    async waitForTransaction({ digest, options }) {
      const response = await grpcClient.waitForTransaction({
        digest,
        include: { effects: options?.showEffects !== false, objectTypes: true },
      });
      const executed = unwrapTransactionResult(response);
      return { digest: executed?.digest ?? digest, effects: executed?.effects ?? null };
    },
  };
}
