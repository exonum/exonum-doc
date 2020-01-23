# Artifact Versioning

Unlike some other blockchain frameworks, Exonum is built with
the first-class support of business logic evolution.
[Service artifacts](../architecture/services.md) may
evolve during blockchain operation, which is reflected in the
fact that a semantic version is a built-in part of the artifact.
This article dives into details how versioning should be implemented
and how it is used in the framework.

## Problem Statement

The problem solved by versioning is as follows.
Exonum services have clients, both internal (other services
on the same blockchain) and external (e.g., light clients
and other software capable of submitting transactions).
For a multitude of reasons, the clients may have
different idea as to the service capabilities than the reality at hand.

Here's hypothetical manifestations of the problem:

- The client thinks service with a certain ID is a crypto-token service,
  but in reality it is a time oracle.
- The client correctly thinks that a service with a certain ID
  is a crypto-token service, but is unaware that the format
  of the transfer transaction has changed.
- The client (another service) attempts to get the consolidated time
  from the schema of a time oracle, but in reality it's not a time oracle.
  (Or it *is* a newer time oracle with changed schema layout.)

In all these cases, the lack of knowledge on the client side may lead
to unpredictable consequences. In the best case, a transaction constructed
by such a client will turn out to be garbage from the service perspective,
so it will *just* return a deserialization error.
In the worst case, the transaction may be interpreted arbitrarily.
The same reasoning is true for the service schema; in the best case,
accessing the bogus schema will lead to an error
due to the mismatch of expected an actual index types. In the worst case,
the indexes *will* be accessed, but will return garbage data
or lead to undefined behavior of the node.

## Solution: Semantic Versioning

For any reasonable solution to the problem above to work,
Exonum artifacts **must** be [semantically versioned]. Indeed,
semantic versioning allows to reason about client / service compatibility
in terms other than “Any specific version of a service artifact
is absolutely incompatible with any other version.”

Correct versioning is the responsibility of the service developers;
the framework does not (and cannot) check versioning automatically.

### General Guidelines

The general guidelines to maximize service longevity are:

- Versioning concerns *all* public interfaces of the service.
  As of Exonum 1.0, these interfaces are transactions and the
  (public part of) service schema.
- Transaction methods can be evolved much like Protobuf messages
  (in fact, transaction payloads should be Protobuf messages
  for this reason). Semantics of a method with the given ID must
  never change; in particular, the method ID must never be reused.
- Removing a method or disabling processing for certain payloads
  should be considered a breaking change (with a possible exclusion
  of bug fixes).
- Public service schema should expose the minimum possible number
  of indexes, since the changes in these indexes will be breaking.

### Transaction Versioning

To be able to process transactions, service must have
a static mapping between numeric identifier of a transaction
and the transaction handler. Logic of transaction processing
may include deserializing input parameters from a byte array,
processing the input and reporting the execution result
(which can be either successful or unsuccessful).

Numeric identifier of a transaction (i.e., `method_id` within the
[transaction payload](../architecture/transactions.md#messages))
is considered a constant during all the time of service existence. If a transaction
was declared with certain ID, its logic can be updated (e.g., to fix a bug)
or be removed, but it **never** should be replaced with another transaction.

### HTTP API

Although HTTP API is [runtime](../glossary.md#runtime)-specific
interface, the best practices regarding API compatibility still apply:

- HTTP endpoints may be prefixed with a version, e.g., `/v1/wallets`
- Removed endpoints should return `410 Gone` error
- Deprecated endpoints can emit a deprecation warning, e.g., via
  a [specialized header][api-deprecation] or [`Warning` header][warning-header]
- Endpoints may employ redirection from an older endpoint to
  a newer one with a `301 Moved Permanently` status

## Versioning in Core

Artifact versions are used in the core, in particular,
in [data migrations](../architecture/services.md#data-migrations).
Indeed, a service can only be migrated from one artifact to another
if the target artifact is a newer version of the source artifact.

!!! example
    A service with artifact `some.Token@0.2.0` can be migrated
    to artifact `some.Token@0.4.1`, but not to `some.Token@0.1.17`
    or `other.Token@1.1.1`.

## Versioning for Clients

The client may check the name and version of the artifact for a specific service
using builtin APIs provided by the Exonum core. For example, the core maintains
a list of deployed artifacts and instantiated services, which can be retrieved
from a schema (for services) or [system API](other-services.md#system-api)
(for external clients).

For transactions, clients may use the middleware service in order to
make [checked calls](other-services.md#checked-call) to the service.
A checked call is executed only if the targeted service has an expected
artifact name and version requirement (for example, `some.Token@^1.2.0`).

For schemas, Rust code may use safe data access provided
by the `SnapshotExt` and `BlockchainData` types. This access checks
artifact name / version requirement under the hood.

[semantically versioned]: https://semver.org/
[api-deprecation]: https://tools.ietf.org/html/draft-dalal-deprecation-header-02
[warning-header]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Warning
