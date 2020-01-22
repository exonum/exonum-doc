# Exonum

**Exonum** is an extensible open-source framework for creating blockchain
applications.
Exonum can be used to create cryptographically powered distributed
ledgers in virtually any problem domain, including FinTech, GovTech, and
LegalTech.
The Exonum framework is oriented towards creating permissioned blockchains,
that is, blockchains with the known set of blockchain infrastructure providers.

Exonum uses [the Rust programming language][rust] in its core to achieve utmost
execution safety;
[service-oriented architecture][wiki:soa] to provide extensibility, flexibility,
and modularity; and client-side verification based on
[cryptographic commitments][wiki:commitment]
(Merkle and Merkle Patricia trees) to ensure transparency of the system
and client security.

Exonum provides [the Java Binding tool](get-started/java-binding.md) together
with a software
development kit (SDK). This allows to build custom services in Java - one of
the most popular programming languages - on top of the Rust-based Exonum
framework.

## Get Started

### Installation

[Exonum][core] is an open-source Rust library providing core functionality
of the Exonum framework. It is available under
[the Apache 2.0 license][apache].
You may refer to [the installation guide](get-started/install.md) in order to
install the library together with its prerequisites.

### Tutorials

[Cryptocurrency Tutorial](get-started/create-service.md) showcases how Exonum
can be used to build a simple cryptocurrency app step by step.

[Cryptocurrency Advanced Tutorial](get-started/data-proofs.md)
also explains how to obtain proofs of data presence in the blockchain.  

[Timestamping Service Tutorial](get-started/timestamping-tutorial.md)
demonstrates how to build one of the most demanded blockchain services and
start up a four-node network that will process requests to this service.

The source code of the tutorials [is available on GitHub][tutorials].

Besides tutorials on usage of the Exonum core, you can find a
[tutorial](get-started/light-client.md) on the [Exonum light client][client] –
a JavaScript library intended for client-side verification of blockchain
information and for performing cryptographic operations (such as digital
signing).

[Service Testing Tutorial](get-started/test-service.md) will teach you how to
test your services with the help of the [testkit library][testkit].

And finally, the [Java Binding User Guide](get-started/java-binding.md) will
teach you how to start a Java project on the Exonum framework.

## Going Deeper

### Framework Design & Motivations

Refer to [*What is Exonum*](get-started/what-is-exonum.md)
for the motivations behind building yet another permissioned blockchain
framework. [*Design Overview*](get-started/design-overview.md)
takes a more technical approach and gives in-depth description of the Exonum
design.

### Services & Clients

The following 2 topics provide valuable insights on how to develop with Exonum:

- [*Services*](architecture/services.md) are the main building blocks
  of the Exonum architecture
- [*Light clients*](architecture/clients.md)
  are the main way for third-party applications to interact with the services.

!!! tip
    See [the anchoring][anchoring] and [configuration update][config] services
    for the examples of real-world Exonum services.

### Specifications

Exonum documentation contains in-depth discussions on numerous other aspects
of the framework, such as [binary serialization](architecture/serialization.md),
[storage](architecture/merkledb.md) and [networking](advanced/network.md).

## Contributing

See the [contribution guide](contributing.md) to get information on how
to contribute to Exonum development, and the [roadmap](roadmap.md) to find out
what features are coming soon.

[rust]: http://rust-lang.org/
[wiki:soa]: https://en.wikipedia.org/wiki/Service-oriented_architecture
[wiki:commitment]: https://en.wikipedia.org/wiki/Commitment_scheme
[core]: http://github.com/exonum/exonum/
[apache]: https://opensource.org/licenses/Apache-2.0
[client]: https://github.com/exonum/exonum-client
[testkit]: https://crates.io/crates/exonum-testkit
[tutorials]: https://github.com/exonum/exonum/tree/master/examples
[anchoring]: https://github.com/exonum/exonum-btc-anchoring/
[config]: https://github.com/exonum/exonum/tree/master/services/configuration
