# Service Interaction

[Exonum services](../architecture/services.md) may interact
with each other using a set of APIs. This article dives
into details how different kinds of interaction can be implemented
and used.

!!! warning
    Interaction among services is considered an experimental feature
    as of Exonum 1.0. Its interfaces and supported features may change
    in the future.
    Additionally, support of interaction may be limited in some environments,
    e.g., for [Java services](../glossary.md#java-service).

## Problem Overview

The problem solved by the techniques described in this article
is as follows. Service A wants to get information from service B
instantiated on the same blockchain, or to modify its data using
an interface provided by service B. A couple of scenarios covered
by this are:

- The dependent service wants to read the current time from
  a [time oracle](time.md), e.g., in order to implement a time-lock
  or check key validity in a [PKI].
- The providing service implements a token interface akin to [ERC-20]
  or [ERC-721] and the dependent service wants to use it to implement
  a complex finance app (lending, insurance, etc.).

## Selecting a Dependency

!!! tip
    See [*Versioning*](versioning.md) for details how Exonum uses
    semantic versioning to establish compatibility relations.

Before any kind of interaction is established, the dependent service
may want to select its dependency. Exonum provides several tools to
ease this process:

- The information about currently deployed [artifacts](../glossary.md#artifact)
  and service instances is available to services via a data schema.
  Using it, a service may search for service instances satisfying
  a certain artifact requirement (artifact name and a semantic version requirement,
  e.g., `some.Token@^1`). The service may search the dependency once
  during its initialization and cache it in its own configuration.
- Alternatively, the dependent service may be injected the dependency
  during its [initialization](../architecture/services.md#hooks) or
  [configuration](supervisor.md#service-configuration). The dependency
  may be specified as a service ID.
  
Both techniques are fully compatible. Indeed, mentioning
the explicit service ID during initialization may be optional;
if skipped, the service may perform the search automatically,
and during service reconfiguration this dependency may be overridden.
What happens if none of instantiated services fit the requirement
or several do, depends on the use case. As an example, the service
may return an error (i.e., refuse to instantiate) or choose one of
dependencies randomly.

!!! note
    Keep in mind that dependencies may become unavailable due
    to [service lifecycle](../architecture/service-lifecycle.md).
    For example, the dependency may be stopped or updated to an incompatible
    version. Taking dependent services into account during lifecycle is
    [one of the roadmap goals](../roadmap.md#service-dependencies).

## Interaction via Schemas

To *read* service data, the dependent service
may use the public schema definition provided by the dependency.
For example, the [time oracle](time.md) defines in its schema
a [`ProofEntry`](../architecture/merkledb.md#proofentry) containing
the current consolidated time, so it can be read by any service.

Depending on the service runtime, the service may have tools facilitating
this kind of interaction. For example, the Rust runtime allows to
check artifact requirements for the schema behind the scenes,
thus preventing access to a wrong type of service or to an incompatible
service version.

While interaction via schemas has low overhead, it has some limitations;
e.g., the dependency cannot process the data or encapsulate it before
returning it to the dependent service. An improved kind of interaction –
unified [*read requests*](../glossary.md#read-request) –
[is in the works](../roadmap.md#unified-read-requests). They would work
similar to [interfaces](#interaction-via-calls) described below.

## Interaction via Calls

To *modify* service state, the dependent service may use
[*service interfaces*](../glossary.md#interface). An interface is
a collection of [transactions](../architecture/transactions.md),
the handlers of which are implemented by the dependency. Interfaces
are identified by a string name (e.g., `exonum.Token`), and methods
within the interface have integer identifiers.

Service interfaces fulfil the same role as interfaces in Java or
in Solidity.
However, their call semantics are most similar to [Rust traits]:

- Service artifact needs to explicitly specify that it implements
  an interface. No structural / duck typing is performed. This is motivated
  by the observation that interfaces may imply additional constraints
  (e.g., a token interface must not create tokens during transfers).
- Interface methods cannot collide. That is, any two methods
  from two different interfaces will always have different handlers
  within a service and cannot be mixed during a call. (Cf.
  4-byte method identifiers in Solidity or collision of methods
  with the same signature in Java.)
- The called interface needs to be explicitly specified, thus making
  the caller’s intent clear and unequivocal.

### Example

Consider a hypothetical fungible token interface defined with a Protobuf
IDL:

```protobuf
service Token {
  option (exonum.interface) = "exonum.Token";

  // Transfers tokens to another account.
  rpc Transfer (Transfer) returns (google.protobuf.Empty) {
    option (exonum.method_id) = 0;
  }

  // other methods skipped...
}

// Information about a token transfer.
message Transfer {
  exonum.crypto.PublicKey to = 1;
  uint64 amount = 2;
}
```

!!! warning
    The options in the IDL are for illustrative purposes only; Exonum
    does not (yet) have a well-specified IDL for interfaces.

In this case, the information necessary to perform a call to the service
would be:

- Interface name: `exonum.Token`
- Identifier of the method within the interface: `0`
- Identifier of the called service
- Payload: a serialized `Transfer` message

The Exonum core would perform a check that the called service indeed
implements `exonum.Token` and would not dispatch the call otherwise.
The call handler would by design know that it processes
a call to `exonum.Token#Transfer`.

## Authorization via Services

Besides payload, service calls carry information about **call authorization**.
The called service may use this information to determine whether the caller
can perform the operation. In some other cases (e.g., crypto-tokens),
this info may be used to get or modify information about the caller
in the blockchain state (e.g., the current token balance).

When making a child call, a service may either inherit the authorization
from the parent call, or make a call under its own authority.
Both kinds of auth may make sense depending on the use case.
Inherited auth makes sense for [“middleware”](other-services.md#middleware)
(e.g., batched calls), while service auth makes sense for stateful authorization
(e.g., multi-signatures).

Top-level calls within a block are authorized as follows:

- [Transactions](../architecture/transactions.md) are authorized
  by the Ed25519 public key used in transaction signing
- [Hooks](../architecture/services.md#hooks) executing before and
  after transactions are authorized by a special *blockchain* authority

Information about call auth has a forward-compatible uniform representation
(cf. addresses in Ethereum).
Services may use this representation to compare or index callers
without the necessity to care about all possible kinds of authorization
supported by the framework.

!!! note
    As of Exonum 1.0, the service authorization can only carry the service ID.
    There are [plans](../roadmap.md#service-authorization-with-data)
    to allow services include service-specific data to authorization info.
    This would open possibilities for reuse; for example, a single multi-signature
    service would be able to support any number of independent user groups.
    Another qualitatively new feature enabled by this kind of auth is
    PKI / identity, that is, authorization like “User with name Alice
    as currently defined in the identity service with ID 1000.”

[PKI]: https://en.wikipedia.org/wiki/Public_key_infrastructure
[ERC-20]: https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20.md
[ERC-721]: https://github.com/ethereum/EIPs/blob/master/EIPS/eip-721.md
[Rust traits]: https://doc.rust-lang.org/book/ch10-02-traits.html
