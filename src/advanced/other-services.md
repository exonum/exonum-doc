# Other Common Services

Besides [supervisor](supervisor.md), [time oracle](time.md)
and [Bitcoin anchoring](bitcoin-anchoring.md), there are several
more standard Exonum services, which may be useful in many
applications.

This article provides a high-level overview of the services;
consult their crate docs for more technical details.

## Explorer

[**Explorer service**][explorer] provides several REST and
WebSocket endpoints allowing to retrieve information from the
blockchain in a structured way. For example, it allows to:

- Retrieve latest committed blocks
- Return information about a transaction with a specific hash
  (such as whether the transaction is committed and if so,
  which execution status does it have)
- Check execution status of a [service hook](../glossary.md#service-hook)
- Submit signed transactions into the blockchain

WebSocket API provided by the service allows to:

- Submit signed transactions into the blockchain
- Subscribe to block commitment events (i.e., a client will receive
  a notification each time a new block is added to the blockchain)
- Subscribe to transaction commitment events – a client will receive
  a notification for each new committed transaction. Transactions can be
  optionally filtered by the service ID and method ID within the service.

Unlike most other services, the explorer does not define any
transactions.

!!! note
    Besides the explorer *service*, there is an [explorer library],
    which is useful to access blockchain info from Rust code,
    rather than via HTTP.

### Usage

The explorer is included into the default set of services in the
[`exonum-cli`][exonum-cli] node management tool together with the supervisor,
so no setup is required if you use this tool. Otherwise, the explorer
should be included into a set of [built-in services](../glossary.md#built-in-service)
with the default identifiers. Note that the explorer will refuse
to instantiate more than once. Unlike other Rust services,
the explorer APIs do not have `/api/services/$serviceName` prefix,
but rather `/api/explorer`. 

## Middleware

[**Middleware service**][middleware] provides a collection of middleware,
allowing to compose Exonum transactions. For example, the service
allows to batch transactions in order to execute the batch atomically,
or to check the version of the service before performing a call to it.

### Transaction batching

Batching allows to atomically execute several transactions; if an error occurs
during execution, changes made by all transactions are rolled back. All
transactions in the batch are authorized in the same way as the batch itself.

### Checked call

Checked call is a way to ensure that the called service corresponds to a
specific artifact with an expected version range. Unlike alternatives (e.g.,
finding out this information via the `services` endpoint
of the [system API](#system-api)),
using checked calls is most failsafe; by design, it cannot suffer
from [TOCTOU] issues. It does impose a certain overhead on the execution,
though.

## System API

[**System API**][system-api] is not a service, but rather a *node plugin*.
The difference is that plugins interact with the node using lower-level,
but more privileged APIs. The system API plugin provides information
about the node state using REST interface.

The following info can be retrieved:

- Information about the current set of artifacts and services
- Network connectivity stats
- Version of Exonum / Rust that the node was compiled with

### Usage

System API is included into `exonum-cli`, so no effort is required
if you use this tool. To add the system API plugin manually, you
may import `SystemApiPlugin` from the crate and plug it
into the node builder.

[explorer]: https://docs.rs/exonum-explorer-service/
[explorer library]: https://docs.rs/exonum-explorer/
[exonum-cli]: https://docs.rs/exonum-cli/
[middleware]: https://docs.rs/exonum-middleware-service/
[TOCTOU]: https://en.wikipedia.org/wiki/Time-of-check_to_time-of-use
[system-api]: https://docs.rs/exonum-system-api/