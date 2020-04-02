# Exonum Roadmap

Exonum roadmap represents the major functionality points our team is planning
to bring to the product. Most of the features mentioned in this roadmap will be
implemented for both Exonum Core and Java Binding. However, keep in mind that
there will be a certain time interval between the availability of new features
in Core and Java Binding with some latency for the latter.

Stay tuned for news about updates to the Exonum platform in
our [Medium blog](https://medium.com/@ExonumPlatform).

!!! warning
    This document is provided for informational purposes only. It is subject
    to changes at any time without specific notifications and approvals.

You are welcome to contribute to Exonum development and improvement (see our
[contribution policy](https://github.com/exonum/exonum/blob/master/CONTRIBUTING.md)).
For any questions on the upcoming implementations feel free to contact us in
[Gitter](https://gitter.im/exonum) or [Reddit](https://www.reddit.com/r/Exonum/).

## Previous Accomplishments

!!! tip
    Consult the [core changelog] and [Java binding changelog] for
    more details on implemented features.

- A major milestone for Exonum was transition to *dynamic* services, that is,
  services that can be instantiated after the blockchain is launched.
- Together with dynamic services, we have implemented first-class support
  of [runtimes](glossary.md#runtime). Runtimes allow to write Exonum services
  in multiple programming languages, and new languages may be added without
  any changes to the Exonum core. For now, Exonum supports Rust and Java services
  with more languages in the pipeline.
- Exonum now supports [service lifecycle](glossary.md#service-lifecycle),
  allowing to evolve any given service during blockchain lifetime. For example,
  service data can be safely [migrated](glossary.md#data-migration) to
  match newer business logic, with Exonum ensuring atomicity, agreement among
  nodes and other invariants.
- In a practical sense, the Exonum core was split from a single massive crate
  into multiple loosely coupled components, ensuring flexibility and code reuse.

## Versioning Policy

Exonum strives to provide stable APIs for the core library (i.e., `exonum` crate)
and its re-exported upstream dependencies (e.g., `exonum-crypto`). The downstream
crates (e.g., the supervisor service) or crates unrelated to the core
(e.g., the HTTP API wrapper) are **not** necessarily versioned in the lockstep
with the core library. Thus, they may have breaking changes even if the core
library does not.

Since Exonum is still in active development, the core library is expected
to have quite fast release cycle – a major release once every 6–9 months,
with minor releases each 1.5–2 months.

## Nearest Milestones

### Finalizing Service Interfaces

Exonum 1.0 ships with the [*interfaces*](glossary.md#interface)
as a way of two services to interact with each other.
As an example, this is used by the supervisor service
to [configure other services](advanced/supervisor.md#service-configuration).)
However, interface specification is not yet stabilized, and so far
there is no interface description language to express them. With finalization,
interfaces can provide a powerful tool to compose service functionality.

### Service Authorization with Data

As of 1.0, it is possible to authorize an [internal call](glossary.md#internal-call)
with the service authority, but the caller ID is the only information
provided to the handler. If this is augmented with the caller-defined data,
this kind of authorization can be applied to a significantly wider range
of scenarios. For example, a single multisig service will be able to
serve an unlimited number of user groups, thus maximizing code reuse
and reducing storage / compute overhead.

## Medium Term

### Deferred Calls

A *deferred call* is a call to a service executing after the invoking call
has returned (cf. `defer` in Golang). Deferred calls can provide
an easy way to isolate internal calls to the services without requiring
changes to the storage engine. (In Exonum 1.0, only upper-level calls are
isolated, internal calls are not. Cf. inability to catch exceptions
in Solidity.)

### Capabilities for Services

In 1.0, the supervisor service is determined by its numerical ID, which
is quite inflexible. To amend, we plan to implement a [capabilities framework]
for services. The capabilities would be assigned by the network maintainers.

Besides service lifecycle management, other capabilities can be implemented.
For example, a capability to write to schemas of other services
would be helpful in implementing a transparent and secure way
to amend data mistakes, which are inevitable in real-world blockchain apps.

### Service Dependencies

In Exonum 1.0, dependencies among services are built *ad hoc*. A service
may check the existence and artifact requirements of its dependencies
on initialization and bail out if the requirements are not satisfied.
However, there is nothing preventing network maintainers
from [stopping](architecture/service-lifecycle.md) the dependency or
updating it to an incompatible version.

In the future releases, the [supervisor](advanced/supervisor.md) will take
dependencies into account, making service lifecycle safer and some tasks
(e.g., deploying dependencies) more streamlined.

## Long Term

### Unified Read Requests

As of 1.0, [read requests](glossary.md#read-request) are runtime-specific
and are usually implemented via HTTP API. Unifying read requests and allowing
interfaces to specify read requests would allow to deduplicate much code
and widen the supported service interactions.

### More Runtimes and Programming Languages

Exonum 1.0 allows to write services in Rust and Java. We plan to widen
language support in the future. Two low-hanging fruits in this regard
are:

- Supporting other JVM languages (e.g., Scala, Kotlin)
- Supporting WASM (and thus, any language compiling to WASM)
  via the existing Rust tools

### Save Points and Old Blocks Clean-up

Introduction of save points, which are snapshots of the blockchain at a
certain moment in time, will let a node quickly catch up with the rest of the
network in case of downtime.

This feature is also considered as a basis to solve the problem of storing the
blockchain when its history becomes to long and space-consuming.

### Mirroring Data to External DB

In many use cases, data should be copied from the blockchain to an external
storage that supports more complex analytical queries. Integrating
this functionality within the node would allow to automate the process
and make it more fault-tolerant.

[capabilities framework]: https://en.wikipedia.org/wiki/Capability-based_security
[core changelog]: https://github.com/exonum/exonum/blob/master/CHANGELOG.md
[Java binding changelog]: https://github.com/exonum/exonum-java-binding/blob/master/exonum-java-binding/CHANGELOG.md
