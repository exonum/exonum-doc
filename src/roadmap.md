# Exonum Roadmap

Exonum is an open source software, so there is no particular concept of
“Exonum core developers” (see [contributing guide](contributing)). However,
there're preferred directions of the development. These include maintainers
opinions, natural improvements and a will to correspond to good practices.

!!! Warning
    This document is provided for informational purposes only. It is subjected
    to changes at any time without specific notifications and approvals.

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
version), one can deploy it at once. Afterwards it can be extended with
additional modules, possibly, custom-built directly for the purpose of the
specific project.

!!! note
    This automatically means that [services](architecture/services) should
    be able to connect to already working Exonum application. Similar property
    is valid for [shared
    libraries](https://en.wikipedia.org/wiki/Library_(computing)#Shared_libraries)
    (`.dll` in Windows or `.so` in Unix-based systems): one can override a
    library while programs are running using it.

    In other words, this means that Exonum will support
    '**dynamically added smart-contracts**', which are known in other blockchain
    systems. The difference of our approach from public blockchains is the
    following. A service can be *added* to a blockchain, however, in order to
    *use* it, validators need to approve new
    [configuration](architecture/configuration) with the service marked as
    active.

Lifecycle for a service in Exonum would looks like as the following:

- The service is uploaded as a shared library within a specific transaction in
  Exonum blockchain
- [Validators](architecture/consensus/#assumptions) make a decision on
  inclusion of a service into active
  [configuration](architecture/configuration)
- A service becomes active, that is available for users of the system
- If necessary services can be removed by the
  [consensus](architecture/consensus) of validators

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

    - **High level binding**, or a Java interface for Exonum's public API. This
      part allows the developer to connect blockchain to Java applications
      directly. Technically, within this part Rust code (Exonum Core) is called
      from Java code (the application that makes use of Exonum).
    - **Service binding**. This part allows to implement services and
      potentially other Exonum modules (for example, [Leader
      Election](advanced/consensus/leader-election)) in Java. Thus, Exonum
      Core (Rust code) should be able to run JVM and launch
      Java code.

## Object Relational Mapping

Exonums' current implementation implies that a service developer should
manually specify a number of parameters (service ID, transaction ID's, binary
offsets of data in [transactions](architecture/transactions)). This
specification is unclear, leads to a big number of potential problems.

!!! note "Example"
    One can easily imagine a huge problem caused by two different services
    having the same ID.

As a solution of this issue a declarative format is considered for service
specification. Such technique is similar to [interface description language, or IDL](https://en.wikipedia.org/wiki/Interface_description_language).

Declarative service description can be added to a blockchain using specific
transaction. It should include:

- [Data schema](architecture/services/#data-schema) (a set of indexes,
  related to a service)
- A list of [transactions](architecture/services/#transactions)
- API description (both [public](architecture/services/#read-requests) and
  [private](architecture/services/#private-api))

!!! note
    The main part of the service, which cannot be stated (at least in a
    simple way) within the declarative description, is transactions application
    to a database (see [`execute`
    method](architecture/transactions/#execute)).

Declarative description is a feature that helps developer make less mistakes.
Besides, it also enables several important features. Here are two of them.

- **Server-side code generation**. Having service description, one can generate
  the major part of the 'formal' server code. This refers to the definition of
  all necessary service functions, indexes hierarchy, usage of the relevant
  function arguments and so on. Code generation will substantially ease
  developers' work, leaving him only the implementation of service business
  logic.
- **Unified light client**. In the current version of the [light
  client](architecture/clients), one need to specify it for each
  Exonum-based project. This is a consequence of unknown index hierarchy, which
  leads to inability to check entire cryptographic proofs (see [Merkle
  index](advanced/merkle-index), for example), which are returned from the
  backend. Instead light client is able to check the proof within a single
  Merkle proof. Having declarative description in the blockchain (and thus
  clients' ability to get it), will allow the light client to determine proof
  structure automatically and there will be no need for customization of a
  light client for different Exonum-based systems.

## Service Isolation and Events

An essential part of Exonum services is [Data
schema](architecture/services/#data-schema). It represents the data, which
is directly related to service. In current version of Exonum there's no data
access control within storage. On one hand, this brings the ability of service
interaction: service A can change the data, which is described in the data
schema of service B.

!!! note "Example"
    The key rotation in
    [bitcoin anchoring service](advanced/bitcoin-anchoring) is implemented
    using this mechanism (keys
    are updated using [configuration updater](advanced/configuration-updater)
    service).

However, this approach has its drawbacks: a broken service can harm other
services and even halt the whole blockchain. This problem can be solved using
**service isolation** concept, that is separating service data and execution on
the middleware level (on the level of Exonum Core).

!!! note
    Virtual machine or docker containers for service execution are examples of
    approaches, which automatically lead to service isolation

Service isolation leads to impossibility of service interaction using storage.
The mechanism of **events** can fill this gap. Events work as follows:

- Service A defines a set of events
- Using functions from service A implementation, service B can subscribe on
  events
- In case the event is triggered, service A notifies all subscribers, calling
  their call-back functions (which were specified during the subscription)

This approach is often referred to as [pub/sub (publish-subscribe)
pattern](https://en.wikipedia.org/wiki/Publish%E2%80%93subscribe_pattern).

!!! note "Example"
    Using events mechanism, one can implement specific services which are
    called **oracles**. An oracle implements a simple function on notifying
    subscribers on some event. For example, one can imagine *election oracle*,
    managed by the government, which will put into the blockchain trusted
    information about the winner of elections. *Bets service* can use this
    information to determine winning bids.

!!! warning
    In current Exonum version because of insufficient service isolation, one
    also can implement events mechanism. However, such implementation will be
    custom for every use case and may lead to serious problems due to the lack
    of general approach on blockchain level.

## Transactions Improvements

As mentioned in [services
description](architecture/services/#transaction-interface), transactions are
separate entities rather than datatypes. This directly leads to the ability to
incorporate within transaction object additional logic. As a first step we
consider implementing the ability to determine **transaction ordering**
mechanics (unconfirmed transactions prioritization) as a method of transaction
interface. This logic comes hand-by-hand with *transaction finalization*.

!!! note
    In current Exonum implementation transactions are finalized only by
    recording into blockchain (even if transaction execution does not lead to
    changes in storage). This potentially results in problems with the size
    of data storage, but gives protection against [replay
    attacks](https://en.wikipedia.org/wiki/Replay_attack).

## Networking Improvements

Currently all network channels in Exonum (channels between validators, full
nodes and light clients) are unsafe. Because of this 3rd parties can possibly
get an access to a blockchain data, even if they're not allowed to.

!!! note
    [Packet sniffing](https://en.wikipedia.org/wiki/Packet_analyzer) is a
    common network attack strategy.

We're going to solve this issue by introducing **encrypted channels** (this can
be done, for example, using [transport level security
protocol](https://en.wikipedia.org/wiki/Transport_Layer_Security))
