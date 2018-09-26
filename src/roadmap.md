# Exonum Roadmap

Exonum roadmap represents the major functionality points our team is planning
to bring to the product. Most of the features mentioned in this roadmap will be
implemented for both Exonum Core and Java Binding. However, keep in mind that
there will be a certain time interval between the availability of new features
in Core and Java Binding with some latency for the latter.

Stay tuned for news about updates to the Exonum platform in
our [blog](https://exonum.com/blog/).

!!! warning
    This document is provided for informational purposes only. It is subject
    to changes at any time without specific notifications and approvals.

## Fourth Quarter of 2018

### Separation of Transactions and Messages

The separation of transactions and messages into two individual entities will
lay the foundation for other crucial features such as standardization of
interfaces of services, communication between services within the blockchain and
other. This separation will also prove extremely useful in the efforts of
changing the serialization format of Exonum to a more common one.

### Protobuf as the Serialization Format in Exonum

Protobuf is the industry accepted serialization format supported in multiple
programming languages. Use of Protobuf will ease the integration of Exonum with
applications in other languages. It will also enable the development of light
clients in other languages with less effort required.

Protobuf has already been used in several applications of [Exonum Java Binding](https://github.com/exonum/exonum-java-binding).

### Storage Enhancements

We are planning to make Exonum storage interfaces more developer-friendly and,
due to this optimization, improve system performance and data auditability. The
first stage of storage
improvements will include the separation of node-specific and consensus-related
data, which may, for example, accelerate the node recovery process. Within this
stage we will also implement a basic form of Storage API for services and
external clients. Further improvements to storage will be introduced in one of
the following versions.

### Services Interface Standard

To change the way services are defined in Exonum, we will introduce a uniform
service interface description, processed by means of Protobuf. Services will
now be defined not by their ID, but by a specific language for interface
description. As a result, services will be described uniformly, thus, making
clear which transactions and arguments they process.

Uniform service definition will also ease the development of light clients in
any language supported by Protobuf. In the first phase of the implementation,
service interfaces will support a single method type – transactions. Other
method types will be added in one of the following versions.

### Service Identification

We plan on implementing a more logical mechanism of service identification in
Exonum. Such a solution will ease the communication between services and
external clients. This mechanism will also lay the foundation for the
implementation of dynamic services.

Within the scope of implementing the service identification mechanism, we also
plan to provide a uniform framework for installing external services in
Exonum blockchains.

### Secure Workflow for Node Administration

The introduction of a workflow for administrative operations, such as the
deployment of services, is aimed at improving the security of the system.
The exact details of the workflow are being currently discussed. One of the
promising ideas is devising a service through which all the administrative
processes will be conducted.

### Secure Storage for Private Keys of the Node

A separate and secured storage for private keys of the nodes will enhance the
safety of the
system. Even in the case of unauthorized users gaining access to a node,
they will not have access to its private key and will not be able to
intervene into the consensus process.

### Java Binding: Protobuf Support and Separation of Transactions and Messages

As we develop Java Binding alongside with Exonum Core, to equalize their
functionality it is required to implement Protobuf support and separate the
transactions and messages for Java Binding too. This step will promote all the
corresponding [benefits](#Protobuf_as_the_Serialization_Format_in_Exonum)
discussed above.

## First Quarter of 2019

### Service Interface Standard: Read Requests

To increase the performance of the system, we will add read requests to the
list of methods supported by interfaces of services. Read requests do not modify
the blockchain state and can be handled locally on the full node which
receives the request from a client.

### Pre-check of Transactions in the Memory Pool

Checking the validity of transactions which are included into the memory pool
is one of the methods for preventing DoS attacks. This check will also ensure
that transactions do not lead to any errors when processed.

## Second Quarter of 2019

### Dynamic Java Services

The introduction of dynamic Java services will enable adding Java services to
a running blockchain without the need to restart nodes. New services, in the
form of Java modules, will be included into the network on the go. Support for
dependencies between dynamic services will be added in one of the following
versions.

### Communication between Services within the Blockchain

As a method of improving the modularity of services and expanding the
possibilities for their reuse, the Exonum team will introduce the ability for
services to communicate with one another within one blockchain. Services will
be able to issue and process transactions from other services and can, thus, be
reused in a variety of scenarios.

### Storage Enhancements: Proofs and Storage API Improvements

As the next stage of improvements to the Exonum storage, we will add support
for proofs in storage and in Storage API for external clients in particular.
As for Storage API for services, it will include access control mechanisms and
support for other metadata.

## Third Quarter of 2019

### Service Migration

Service migration will enable a smooth update to new versions of the services
running in the blockchain, thus, making use of improvements, which the older
versions do not provide.

### DoS Resistance

The resistance of Exonum blockchains to several types of DoS attacks will
further enhance the security of the system by defining the amount of memory a
node can consume at any moment of time. We are working on improving the
consensus mechanism and
limiting the number of consensus messages and unconfirmed transactions which a
node can store.

### Save Points

Introduction of save points, which are snapshots of the blockchain at a
certain moment in time, will let a node quickly catch up with the rest of the
network in case of downtime. It is highly probable that this feature will be
based on [check points](https://github.com/facebook/rocksdb/wiki/Checkpoints)
in [RocksDB](https://rocksdb.org), the database currently used in Exonum.

### Java Light Client

Exonum already features a
[light client library](https://github.com/exonum/exonum-client) in JavaScript.
We wish to expand the range of clients available for the framework and will
add a light client in Java – one of the most popular programming languages.

## Fourth Quarter of 2019

### Dynamic Java Services: Dependencies

To expand the feature of dynamic Java services in Exonum, we will add the
support for dependencies between services. Dependencies will be indicated
during service installation or initialization. Services will be able to
process transactions issued by other services, in this way broadening and
supplementing the functionality of one another.

### Private Transactions

The functionality of private transactions implements the existence of certain
data within the blockchain network which are known only to certain validators.
These validators will execute private transactions locally, without changing
the blockchain state.

### Non-replayability of Transactions

Making sure that a certain transaction has not been conducted in the past will
no longer require storing the whole blockchain history.

As you may have noticed, the new features are to be released quarterly. You are
welcome to contribute to Exonum development and improvement (see our
[contribution policy](https://github.com/exonum/exonum/blob/master/CONTRIBUTING.md)).
For any questions on the upcoming implementations feel free to contact us in
[Gitter](https://gitter.im/exonum) or [Reddit](https://www.reddit.com/r/Exonum/).
