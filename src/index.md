# Exonum

**Exonum** is an extensible open-source framework for creating blockchain applications.
Exonum can be used to create cryptographically powered distributed
ledgers in virtually any problem domain, including FinTech, GovTech, and LegalTech.
The Exonum framework is oriented towards creating permissioned blockchains,
that is, blockchains with the known set of blockchain infrastructure providers.

Exonum uses [the Rust programming language][rust] to achieve utmost execution safety;
[service-oriented architecture][wiki:soa] to provide extensibility, flexibility,
and modularity; and client-side verification based on [cryptographic commitments][wiki:commitment]
(Merkle and Merkle Patricia trees) to ensure the transparency of the system
and client security.

## Get Started

### Installation

[Exonum Core][core] is a open-source Rust library providing core functionality
of the Exonum framework. It is available under [the Apache 2.0 license][apache].
You may refer to [the installation guide][install] in order to install the library
together with its prerequisites.

### Cryptocurrency Tutorial

[Cryptocurrency tutorial](get-started/create-service.md) showcases how Exonum Core
can be used to build a simple cryptocurrency app step by step.
Besides Exonum Core, the tutorial also makes use of [the light client][client] –
a JavaScript library intended for client-side verification of blockchain information
and for performing cryptographic operations (such as digital signing).

The source code of the tutorial [is available on GitHub][tutorial].

## Going Deeper

### Framework Design & Motivations

Refer to [*What is Exonum*](get-started/what-is-exonum.md)
for the motivations behind building
yet another permissioned blockchain framework. [*Design Overview*](get-started/design-overview.md)
takes a more technical approach and gives in-depth description of the Exonum design.

### Services & Clients

The following 2 topics provide valuable insights how to develop with Exonum:

- [*Services*](architecture/services.md) are the main building block
  of the Exonum architecture
- [*Light clients*](architecture/clients.md)
  are the main way for third-party applications to interact with the services

!!! tip
    See [the anchoring][anchoring] and [configuration update][config] services
    for the examples of real-world Exonum services, and [the cryptocurrency tutorial][tutorial]
    for an example how to use the light client library.

### Specifications

Exonum documentation contains in-depth discussions for numerous other aspects
of the framework, such as [binary serialization](architecture/serialization.md),
[storage](architecture/storage.md), [networking](advanced/network.md), and
[Merkle](advanced/merkle-index.md) and [Merkle Patricia](advanced/merkle-patricia-index.md)
indexes.

## Contributing

See the [contributing guide](contributing.md) to get information on how
to contribute to Exonum development, and the [roadmap](roadmap.md) to find out
what features are coming soon.

[rust]: http://rust-lang.org/
[wiki:soa]: https://en.wikipedia.org/wiki/Service-oriented_architecture
[wiki:commitment]: https://en.wikipedia.org/wiki/Commitment_scheme
[core]: http://github.com/exonum/exonum-core/
[apache]: https://opensource.org/licenses/Apache-2.0
[install]: https://github.com/exonum/exonum-core/blob/master/INSTALL.md
[client]: https://github.com/exonum/exonum-client
[tutorial]: https://github.com/exonum/cryptocurrency
[anchoring]: https://github.com/exonum/exonum-btc-anchoring/
[config]: https://github.com/exonum/exonum-configuration
