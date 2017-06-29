# Exonum Roadmap

Exonum is an open source software, so there is no particular concept of
“Exonum core developers” (see [contributing guide](contributing.md)). However,
there're preferred directions of the development. These include maintainers
opinions, natural improvements and a will to correspond to good practices.

## Overall Direction

Currently Exonum is a
[*framework*](https://en.wikipedia.org/wiki/Software_framework). This means
that in order to run a specific Exonum-based application, one needs to develop
this application with the aid of Exonums' public API. This approach is similar
to using [third parties
libraries](https://en.wikipedia.org/wiki/Third-party_software_component).
Typical workflow in this case is as follows:

- Download the source code of Exonum Core and additional modules
- Implement the logic of interaction with blockchain and other functionality
- Build the application
- Deploy it on the necessary hardware infrastructure

For the convenience, we want to make Exonum a *standalone application*. Thus,
after downloading and building Exonum (or even downloading a pre-built
version), one can deploy the 'clean solution' at once. Afterwards it can be
extended with additional modules, possibly, custom-built directly for the
purpose of the specific project.

!!! note
    This automatically means that [services](../architecture/services.md) will
    become similar to [shared
    libraries](https://en.wikipedia.org/wiki/Library_(computing)#Shared_libraries)
    (`.dll` in Windows or `.so` in Unix-based systems). So Exonum will support
    '**dynamically added smart-contracts**', which are known in other blockchain
    systems (see
    [Ethereum](http://www.ethdocs.org/en/latest/contracts-and-transactions/contracts.html))

Lifecycle for a service in Exonum would look like as the following:

- The service is uploaded as a shared library within a specific transaction in
  Exonum blockchain
- [Validators](../advanced/consensus/consensus/#assumptions) make a decision on
  inclusion of a service into active
  [configuration](../architecture/configuration)
- A service becomes active, that is available for users of the system
- If necessary services can be removed by the
  [consensus](../advanced/consensus/consensus.md) of validators

## Interoperability

## Java Binding

[Rust](https://www.rust-lang.org/en-US/) is a systems programming language,
which is focused on memory safety. It seems to be a good fit for a security
critical applications. However, the community of Rust developers is small. This
fact can become a problem on the way of adoption of Exonum. It would be logical
to extend its functionality to other programming languages by implementing
[bindings](https://en.wikipedia.org/wiki/Language_binding). Java was chosen for
the first binding since it has a wast developer community. We already started
the implementation of Java binding.

!!! note
    Java binding consist of two substantially different parts:

    - **High level binding**, or a binding for Exonum's public API. This part
      allows the developer to connect blockchain to Java applications
      directly. Technically, within this part Java calls Rust.
    - **Service binding**. This part allows to implement services (and
      potentially other Exonum modules) in Java. Thus, Exonum Core (Rust
      programming language) should be able to run JVM and launch services
      whitten in Java.

## Object Relational Mapping

Exonums' current implementation implies that a service developer should
manually specify the set of tables ([Merkle](../advanced/merkle-index) and
[Merkle-Patricia](../advanced/merkle-patricia-index) indexes) in blockchain
database (see [storage](../architecture/storage)). This specification is
unclear, leads to a big number of potential problems. As a solution of this
issue a declarative format is considered for service specification. Such
technique is similar to [object relational
mapping](https://en.wikipedia.org/wiki/Object-relational_mapping), which is
common in ordinary databases.

Declarative service description can be added in a blockchain using specific
transaction. It should include:

- [Data schema](../architecture/services/#data-schema) (a set of indexes,
  related to a service)
- A list of [transactions](../architecture/services/#transactions)
- API description (both [public](../architecture/services/#read-requests) and
  [private](../architecture/services/#private-api))

!!! note
    The main part of the service, which cannot be stated (at least in a
    simple way) within the declarative description, is transactions application
    to a database (see [`execute`
    method](../architecture/transactions/#execute)).

Declarative description is useless by itself. However it is an enabler for
several important features. Here are two of them.

- **Server-side code generation**. Having service description, one can generate
  the major part of the 'formal' server code. This refers to the definition of
  all necessary service functions, indexes hierarchy, usage of the relevant
  function arguments and so on. Code generation will substantially ease
  developers' work, leaving him only the implementation of service business
  logic.
- **Unified light client**. In the current version of the [light
  client](../architecture/clients), one need to specify it for each
  Exonum-based project. This is a consequence of unknown index hierarchy, which
  leads to inability to check entire cryptographic proofs (see [Merkle
  index](../advanced/merkle-index), for example), which are returned from the
  backend. Instead light client is able to check the proof within a single
  Merkle proof. Having declarative description in the blockchain (and thus
  clients' ability to get it), will allow the light client to determine proof
  structure automatically and there will be no need for customization of a
  light client for different Exonum-based systems.
