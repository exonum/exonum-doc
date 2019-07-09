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

## Fourth Quarter of 2018

### Separation of Transactions and Messages

The separation of transactions and messages into two individual entities will
lay the foundation for other crucial features such as standardization of
interfaces of services, communication between services within the blockchain and
other. This separation will also prove extremely useful in the efforts of
changing the serialization format of Exonum to a more common one.

### Protobuf as the Serialization Format in Exonum

[Protobuf](https://developers.google.com/protocol-buffers/) is the industry
accepted serialization format supported in multiple
programming languages. Use of Protobuf will ease the integration of Exonum with
applications in other languages. It will also enable the development of light
clients in other languages with less effort required.

Protobuf has already been used in several applications of [Exonum Java Binding](https://github.com/exonum/exonum-java-binding).

## First Quarter of 2019

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
corresponding [benefits](#protobuf-as-the-serialization-format-in-exonum)
discussed above.

### Java Binding: Time Service

We add another built-in Exonum service into the array of services that can be
easily launched with an Exonum blockchain in Java –
[the Time Oracle](advanced/time.md). The Time
Oracle allows user services to access the calendar time that validators supply
to the blockchain.

## Second Quarter of 2019

### Secure Workflow for Node Administration

The introduction of a workflow for administrative operations, such as the
deployment of services, is aimed at improving the security of the system.
The exact details of the workflow are being currently discussed. One of the
promising ideas is devising a service through which all the administrative
processes will be conducted.

### Exonum MerkleDB - Minimal Profile

The first step within the global initiative to introduce MerkleDB in Exonum.
This step will result in implementation of a more intuitive storage API
interface. Such interface will simplify interaction with the storage for service
developers.

### Java Application Package

This usability achievement allows shipping Exonum as a ready-to-install
application package. The package is targeted at Java developers
who plan to develop Exonum-based services. The application will have Rust and
other related libraries pre-installed. This means that no compilation of the
application will be required.

### Java Light Client

With this step we expand the range of clients available for the framework.
Apart from the [light client library](https://github.com/exonum/exonum-client)
in JavaScript, we add a light client in Java – one of the most popular
programming languages. Java client allows to send transaction of both Rust and
Java services into the blockchain. It also supports functionality of the
[blockchain explorer](https://github.com/exonum/blockchain-explorer)
available in Exonum. Namely, it allows to obtain information on blocks,
transactions, network nodes (a number of transactions in pool, Exonum version,
etc.).

### Multiple Java Services

We enable support of several client services written in Java within
one Exonum instance. The necessary set of services should be activated together
with initialization of the blockchain. This feature serves as a prerequisite for
dynamic Java services that will be implemented further.

### Java Benchmarking

Collection of metrics that allow to monitor efficiency of the Java Binding tool
in the frame of the application; also to make application profiling and
determine its weak spots.

## Third Quarter of 2019

### Base for Dynamic Services

The executable file of Exonum instance contains a number of built-in services.
Initially, developers launched the required services at the start of the network
without further possibility to adjust the list of applied services. The present
milestone provides an opportunity to turn on/off the services present in the
executable Exonum file without restarting the network.

## Fourth Quarter of 2019

### Service Migration

An extension to the above-mentioned functionality on dynamic services. The
service migration will enable a smooth update to new versions of the services,
running in the blockchain, without service data loss.

### New Storage API Support in Java

Following implementation of MerkleDB in Exonum Core, the Java Binding tool will
also have to update its storage API to make it compatible with MerkleDB.

### Java Light Client Enhancements

A full-fledged version of Java light client featuring support of cryptographic
proofs of availability/absence of certain data in the blockchain.

### Dynamic Java Services

The introduction of dynamic Java services will enable adding Java services to
a running blockchain without the need to restart nodes. In other words, new
services will be included into the network on the go.

## First Quarter of 2020

<!--### Implementation of gRPC

Exonum intends to shift from REST API to gRPC. Just like Exonum, gRPC supports
Protobuf as an instrument for description and serialization of data types.
Besides, gRPC is a potentially quicker communication protocol compared to
REST.-->

### Save Points and Old Blocks Clean-up

Introduction of save points, which are snapshots of the blockchain at a
certain moment in time, will let a node quickly catch up with the rest of the
network in case of downtime.

This feature is also considered as a basis to solve the problem of storing the
blockchain when its history becomes to long and space-consuming.

## Second Quarter of 2020

### Exonum MerkleDB - Full-fledged Implementation

In the final implementation of this functionality the nested data collections
stored in Exonum will receive a hierarchical pattern. The hierarchy of the
Merkelized collections will allow to implement proofs of availability of the
whole collections or their leaves in the blockchain. A user-friendly API of the
Exonum MerkleDB will serve this purpose.

### Communication between Services within the Blockchain

As a method of improving the modularity of services and expanding the
possibilities for their reuse, we will introduce the ability for
services to communicate with one another within one blockchain. Services will
be able to issue and process transactions from other services and can, thus, be
reused in a variety of scenarios.

As you may have noticed, the new features are to be released quarterly. You are
welcome to contribute to Exonum development and improvement (see our
[contribution policy](https://github.com/exonum/exonum/blob/master/CONTRIBUTING.md)).
For any questions on the upcoming implementations feel free to contact us in
[Gitter](https://gitter.im/exonum) or [Reddit](https://www.reddit.com/r/Exonum/).
