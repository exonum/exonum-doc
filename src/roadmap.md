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

- A major milestone for Exonum was transition to *dynamic* services, that is,
  services that can be instantiated after the blockchain is launched.
- Together with dynamic services, we have implemented first-class support
  of [runtimes](glossary.md#runtime). Runtimes allow to write Exonum services
  in multiple programming languages, and new languages may be added without
  any changes to the Exonum core. For now, Exonum supports Rust and Java services
  with more languages in the pipeline.
- Exonum now supports [service lifecycle](glossary.md#service-lifeycle),
  allowing to evolve any given service during blockchain lifetime. For example,
  service data can be safely [migrated](glossary.md#data-migration) to
  match newer business logic, with Exonum ensuring atomicity, agreement among
  nodes and other invariants.
- In a practical sense, the Exonum core was split from a single massive crate
  into multiple loosely coupled components, ensuring flexibility and code reuse.

## Nearest Milestones

### Artifact Unloading

In 1.0, artifacts cannot be unloaded from a runtime; once an artifact is loaded,
it must forever be available. Naturally, we want to change this situation and
allow to unload artifacts by implementing the corresponding workflow
in the core and [supervisor](glossary.md#supervisor).

### Freezing Services

In 1.0, services may be *stopped*, which requires from the runtime to unload
all ways for a service to interact with the external world. For example,
both Rust and Java runtimes need to remove HTTP API handlers of the service.
We plan to implement service *freezing*, after which the service state is
immutable, but the immutable handlers (e.g., HTTP API) remain active.

## Intermediate Term

### Finalizing Service Interfaces

Exonum 1.0 ships with the [*interfaces*](glossary.md#interface)
as a way of two services to interact with each other.
As an example, this is used by the supervisor service
to [configure other services](advanced/supervisor.md#service-configuration).)
However, interface specification is not yet stabilized, and so far
there is no interface description language to express them. With finalization,
interfaces can provide a powerful tool to compose service functionality.

### Deferred Calls

A *deferred call* is a call to a service executing after the invoking call
has returned (cf. `defer` in Golang). Deferred calls can provide
an easy way to isolate internal calls to the services without requiring
changes to the storage engine. (In Exonum 1.0, only upper-level calls are
isolated, internal calls are not. Cf. inability to catch exceptions
in Solidity.)

### Service Authorization with Data

As of 1.0, it is possible to authorize an [internal call](glossary.md#internal-call)
with the service authority, but the caller ID is the only information
provided to the handler. If this is augmented with the caller-defined data,
this kind of authorization can be applied to a significantly wider range
of scenarios. For example, a single multisig service will be able to
serve an unlimited number of user groups, thus maximizing code reuse
and reducing storage / compute overhead.

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
