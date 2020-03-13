# Java Binding User Guide

<!-- cspell:ignore testnet,prepend,JDWP,Protoc -->

**Exonum Java Binding** is a framework for building blockchain applications in
Java, powered by Exonum.

With Exonum Java Binding you can define stateful Exonum Services in Java,
configure a network of nodes and run your services in it.

Exonum Java Binding provides:

- [SDK](https://exonum.com/doc/api/java-binding/0.9.0-rc2/index.html) for
  service development as a number of Java libraries.
- Exonum Java Application — an Exonum node with built-in support
  for running Java services.

## Installation

To run a node with your Java service you need to use Exonum Java application.

There are several installation options:

- [Manual installation](#manual-installation) — available for Mac OS and Linux,
  _recommended for Linux users_
- [Homebrew package](#homebrew-package) — available for Mac OS only,
  _recommended for Mac users_
- [Build from source](#build-from-source) — available for Mac OS and Linux

Windows is not supported by Java Binding at the moment, consider using
[WSL] or [Docker][docker-for-windows].

### Manual Installation

You can download an archive containing the application and
all the necessary dependencies on [the Releases page][github-releases] on GitHub.
We suggest using `debug` version during development and `release` version for
deployment.

1. Download and unpack the archive from the [Releases page][github-releases]
  into some known location. To install the latest release to `~/bin`:

    ```bash
    mkdir -p ~/bin
    cd ~/bin
    unzip /path/to/downloaded/exonum-java-0.9.0-rc2-release.zip
    ```

2. Install [Libsodium][libsodium] as the necessary runtime dependency.

    !!! note
        Exonum Java is built with Libsodium 23, which means it will not work
        on some older Linux distributions, like Ubuntu 16.04. Libsodium 23 is
        available in Ubuntu 18.04 or can be installed from a custom PPA.

    ```bash tab="Linux (Ubuntu)"
    sudo apt-get update && sudo apt-get install libsodium-dev
    ```

    ```bash tab="Mac OS"
    brew install libsodium
    ```

3. Follow the steps in the [After Install](#after-install) section below

### Homebrew Package

For Mac users, we provide a [Homebrew][homebrew] repository, which gives the
easiest way of installing Exonum Java App:

```bash
brew tap exonum/exonum
brew install exonum-java
```

This will install `exonum-java` binary with all the necessary dependencies.
However, you still need to follow the steps mentioned in
[After Install](#after-install) section below.

### Build from Source

It is also possible to build Exonum Java application from sources. To do so,
follow the instructions in [Contribution Guide][how-to-build].

### After Install

1. Create an environment variable `EXONUM_HOME` pointing at installation
  location.

    ```bash
    # The path is provided in after-install message in case of Homebrew
    export EXONUM_HOME=~/bin/exonum-java-0.9.0-rc2-release
    # Setting PATH variable is not needed in case of Homebrew
    export PATH="$PATH:$EXONUM_HOME/bin"
    ```

2. Install the [latest JDK][jdk].

3. Install [Maven 3][maven-install] which is essential for developing and building
  Java service.

## Creating Project

The easiest way to create a Java service project is to use a template project
generator. After [installing Maven 3][maven-install], run the command:

``` none
mvn archetype:generate \
    -DinteractiveMode=false \
    -DarchetypeGroupId=com.exonum.binding \
    -DarchetypeArtifactId=exonum-java-binding-service-archetype \
    -DarchetypeVersion=0.9.0-rc2 \
    -DgroupId=com.example.myservice \
    -DartifactId=my-service \
    -Dversion=1.0.0
```

You can also use the interactive mode:

``` none
mvn archetype:generate \
    -DarchetypeGroupId=com.exonum.binding \
    -DarchetypeArtifactId=exonum-java-binding-service-archetype \
    -DarchetypeVersion=0.9.0-rc2
```

The build definition files for other build systems (e.g., Gradle)
can be created similarly to the
template. For more information see an [example][build-description].

## Service Development

The service abstraction serves to extend the framework and implement the
business logic of an application. The service defines the schema of the stored
data that constitute the service state; transaction processing rules that can
make changes to the stored data; handles events occurring in the ledger;
and defines an API for external clients that allows interacting
with the service from outside of the system. See more information on the
software model of services in the [corresponding section][Exonum-services].

In Java, the abstraction of a service is represented by
[`Service`][service] interface. Implementations can use the
abstract class [`AbstractService`][abstract-service].

<!-- todo: Add an example of a bare-bones Service -->

### Schema Description

<!-- todo: Rewrite the section — it lacks some structure: ECR-4262 -->

Exonum provides several collection types to persist service data. The main
types are sets, lists and maps. Data organization inside the
collections is arranged in two ways – ordinary collections and
[Merkelized collections](../architecture/merkledb.md#merkelized-indexes);
the latter allow
providing cryptographic evidence of the authenticity of data to the clients of
the system (for example, that an element is stored in the collection under a
certain key). The [blockchain state](../glossary.md#blockchain-state) is
influenced only by the Merkelized collections.

For the detailed description of all Exonum collection types see the
corresponding [documentation section](../architecture/merkledb.md#index-types).
In Java, implementations of collections are located in
[a separate package][storage-indices]. Said package documentation
describes their use.

!!! note
    `SparseListIndex` is not yet supported in Java. Let us know if it may be
    useful for you!

Collections are instantiated using a database view. The database view
works as an index factory. The views may be based on a `Snapshot` — a read-only
view corresponding to the database state as of the latest committed block;
or `Fork`, which is mutable and allows performing modifying operations. The
database view is provided by the framework: `Snapshot` can be
requested at any time, while `Fork` – only when the transaction is executed. The
lifetime of these objects is limited by the scope of the method to which they
are passed to.

Exonum stores elements in collections as byte arrays. Therefore,
serializers for values stored in collections must be provided.
See [Serialization](#serialization) for details.

<!--codeinclude-->
[Example of accessing ProofMapIndex](../../code-examples/java/exonum-java-binding/site-examples/src/main/java/com/exonum/binding/example/guide/ProofMapCreation.java)
block:putEntry
<!--/codeinclude-->

A set of named collections constitute a *service schema*. A service schema
is usually created using a [`Prefixed`](#blockchain-data) database access
object, which provides isolation of all service indexes from other instances.

For convenient access to service collections you can implement a factory
of service collections.

*The state of the service in the blockchain* is determined by the index hashes
of its Merkelized collections. Exonum performs the _state aggregation_
of all non-grouped Merkelized collections automatically. See
the [“State Aggregation”](../architecture/merkledb.md#state-aggregation)
section of MerkleDB documentation for details.

<!--codeinclude-->
[Example of a Service Schema with a single Merkelized collection](../../code-examples/java/exonum-java-binding/site-examples/src/main/java/com/exonum/binding/example/guide/FooSchema.java)
block:FooSchema
<!--/codeinclude-->

#### Blockchain Data

[`BlockchainData`][blockchain-data] is the object providing access to blockchain
data of a particular service instance.

The service instance data is accessible via a `Prefixed` access which isolates
the service data from all the other instances.

On top of that, this class provides read-only access to persistent data of:

- [Exonum Core][blockchain], containing information on blocks, transactions,
  execution results, consensus configuration, etc.
- Dispatcher, containing information on deployed service artifacts and active
  service instances.
- Other services.

[blockchain-data]: https://exonum.com/doc/api/java-binding/0.10.0/com/exonum/binding/core/blockchain/BlockchainData.html

#### Serialization

As Exonum storage accepts data in the form of byte arrays,
storing user data requires serialization.
Java Binding provides a set of built-in *serializers* that you can find
in the [`StandardSerializers`][standard-serializers] utility class.
The list of serializers covers the most often-used entities and includes:

- Standard types: `boolean`, `float`, `double`, `byte[]` and `String`.
  Integers with various encoding types,
  see [`StandardSerializers`][standard-serializers] Java documentation
  and the table below.
- Exonum types: `PrivateKey`, `PublicKey` and `HashCode`.
- Any Protobuf messages using `StandardSerializers#protobuf`.

Besides the available built-in serializers, users can still implement
their own serializers for storing their data in a custom format instead
of using the built-in ones.

##### Integer Encoding Types Comparison Table

| Type | Description | The most efficient range |
|---|---|---|
| `fixed32` | Always four bytes | If values are often greater than `2^28` |
| `uint32` | Unsigned int that uses variable-length encoding | If values are in range `[0; 2^21-1]` |
| `sint32` | Signed int that uses variable-length encoding | If values are in range  `[-2^20; 2^20-1]` |
| `fixed64` | Always eight bytes | If values are often greater than `2^56` |
| `uint64` | Unsigned int that uses variable-length encoding | If values are in range `[0; 2^49-1]` |
| `sint64` | Signed int that uses variable-length encoding | If values are in range  `[-2^48; 2^48-1]` |

### Transactions Description

Exonum transactions allow you to perform modifying atomic operations with the
storage. Transactions are executed sequentially, in the order determined by the
consensus of the nodes in the network.

Transactions are transmitted by external service clients to the framework as
[Exonum messages][transactions-messages]. The transaction message includes
the transaction arguments that can be serialized using an arbitrary algorithm
supported by both the service client and the service itself.

For more details about transactions in Exonum – their properties and processing
rules – see the corresponding section of our [documentation][transactions].

#### Transaction Definition

A transaction is a `Service` method that is annotated with
the [`@Transaction`][transaction] annotation and defines the transaction
business logic. The transaction method describes the operations that are applied
to the current storage state when the transaction is executed.

A transaction method must accept two parameters:

1. _arguments_ either as a protobuf message or as a `byte[]`.
  Protobuf messages are deserialized using a `#parseFrom(byte[])` method of
  the actual parameter type.
2. _execution context_ as `ExecutionContext`.

The [execution context][execution-context] provides:

- A mutable access to the blockchain data, which allows performing modifying
  operations;
- The service instance name and numeric ID;
- Some information about the corresponding transaction message:
  its SHA-256 hash that uniquely identifies it, and the author’s public key.

A service schema object can be used to access data collections of this service.

<!--codeinclude-->
[Transaction Example: Service Method](../../code-examples/java/exonum-java-binding/site-examples/src/main/java/com/exonum/binding/example/guide/FooService.java)
inside_block:ci_put_tx
<!--/codeinclude-->

<!--codeinclude-->
[Transaction Example: Arguments Message](../../code-examples/java/exonum-java-binding/site-examples/src/main/proto/example/guide/transactions.proto)
<!--/codeinclude-->

An implementation of the `Transaction` method must be a pure function,
i.e. it must produce the same _observable_ result on all the nodes of the system
for the given transaction. An observable result is the one that affects the
blockchain state hash: a modification of a collection that affects the service
state hash, or an execution exception.

##### Exceptions

Transaction methods may throw [`ExecutionException`][execution-exception]
to notify Exonum about an error in a transaction execution.

The `ExecutionException` contains an integer error code and
a message with error description. The error code allows the clients
of this method to distinguish the different types of errors that
may occur in it. For example, a transaction transferring tokens
from one account to another might have the following error conditions
that the client needs to distinguish:

- Unknown receiver ID
- Unknown sender ID
- Insufficient balance
- Same sender and receiver.

An exception of any other type will be recorded with _no_ error code
as an “unexpected” execution error.

If transaction execution fails, the changes made by the transaction are
rolled back, while the error data is [stored in the database][call-errors-registry]
for further user reference. Light clients also provide access to information
on the transaction execution result (which may be either success or failure)
to their users.

[execution-exception]: https://exonum.com/doc/api/java-binding/0.10.0/com/exonum/binding/core/transaction/ExecutionException.html
[call-errors-registry]: https://exonum.com/doc/api/java-binding/0.10.0/com/exonum/binding/core/blockchain/Blockchain.html#getCallErrors(long)

#### Submitting Transactions to Self

If the service itself needs to create a transaction on a particular node,
it can use the [`Node#submitTransaction`][node-submit-transaction] method.
This method will create and sign a transaction message using
the [service key][node-configuration-validator-keys]
of _that particular node_ (meaning that the node will be the author
of the transaction), and submit it to the network.
Invoking this method on each node unconditionally will produce
_N_ transactions that have the same payloads, but different
authors’ public keys and signatures, where _N_ is the number of nodes
in the network.

[node-configuration-validator-keys]: ../architecture/configuration.md#validator-keys

#### Before and After Transactions Handlers

Services can receive notifications:

- before any transactions in a block has been processed
- after all transactions in a block has been processed, but before the block
  has been committed.

Such notification allow inspecting the changes made by the transactions
and modifying the service state.

Exonum delivers these notification to implementations
of [`Service#beforeTransactions`][service-before-transactions] and
[`Service#afterTransactions`][service-after-transactions] methods.
The `beforeTransactions` method sees the state of the database
as of the last committed block, possibly, modified by the previously
invoked `beforeTransactions` handlers of other services.
The `afterTransactions` handlers see the blockchain state after all transactions
in the block have been applied.

Both methods may make any changes to the service state, which will be included
in the block. As transactions, the implementations must produce
the same observable result on all nodes of the system.
If exceptions occur in this handler, Exonum will roll back any changes made
to the persistent storage in it.

The execution result of `before-` / `afterTransactions` is also saved in
the [database][call-errors-registry].

### Blockchain Events

A service can also handle a block commit event that occurs each time
the framework commits a new block. The framework delivers this event to
implementations of [`Service#afterCommit(BlockCommittedEvent)`][service-after-commit]
callback in each deployed service. Each node in the network processes
that event independently from other nodes. The event includes a `BlockchainData`
snapshot, allowing a read-only access to the database state _exactly_ after
the commit of the corresponding block.

As services can read the database state in the handler, they may detect
any changes in it, e.g., that a certain transaction is executed;
or some condition is met. Services may also create and submit new transactions
using [`Node#submitTransaction`][node-submit-transaction]. Using this callback
to notify other systems is another common use case, but the implementations
must pay attention to **not** perform any blocking operations such as
synchronous I/O in this handler, as it is invoked synchronously in the same
thread that handles transactions. Blocking that thread will delay transaction
processing on the node.

### External Service API

The external service API is used for the interaction between a service
and external systems.
A set of operations defined by a service usually includes read requests
for the blockchain data with the provision of the corresponding cryptographic
proof. Exonum provides an embedded web framework for implementing
the REST-interface of the service.

[`Service#createPublicApiHandlers`][service-create-public-api] method is used to
set the handlers for HTTP requests. These handlers are available at the
common path corresponding to the service name. Thus, the `/balance/:walletId`
handler for balance requests in the “cryptocurrency” service will be available
at `/api/services/cryptocurrency/balance/:walletId`.

See [documentation][vertx-web-docs] on the possibilities of `Vert.x` used as a web
framework.

!!! note
    Java services use a _separate_ server from Rust services.
    The TCP ports of Java and Rust servers are specified
    when a node is started, see [“Running the node”](#running-the-node)
    section for details.

### Configuration

#### Initialization and Initial Configuration

Service can initialize its persistent state on its start using
[`Service#initialize`][service-initialize].

<!-- TODO: Link to the sections on starting new services -->

Exonum invokes this method when a new service instance is added
to the blockchain. Administrators, initiating this action,
may pass some initialization parameters. A service is responsible for
validation of these parameters. If they are incorrect, it shall throw
an [`ExecutionException`][execution-exception], which will abort the start
of this service instance.

A service shall also update its _persistent_ state based on these parameters.
It shall not derive the `Service` _object_ state from them, as
Exonum may instantiate multiple `Service` objects for a single
service instance (e.g., when a node is stopped and then restarted).

For example, a service may set some initial values in its collections,
or save all or some configuration parameters as is for later retrieval
in transactions and/or read requests.

<!-- TODO: example -->

#### Reconfiguration

<!-- TODO: link the complete documentation on reconfiguration,
especially in terms of its invocation by administrators -->

[Exonum supervisor service](../advanced/supervisor.md)
provides a mechanism to reconfigure the started service instances.
The re-configuration protocol for _services_
is similar to the one for consensus configuration.
This protocol includes the following steps:

1. a proposal of a new configuration;
2. verification of its correctness;
3. approval of the proposal; and
4. application of the new approved configuration.

The protocol of the _proposal_ and _approval_ steps is determined
by the installed supervisor service.
The service can implement _verification_ and _application_ of the parameters by
implementing [`Configurable`][configurable] interface.

<!-- TODO: Example of Configurable service -->

Exonum includes a [standard implementation][standard-supervisor-rustdoc]
of the supervisor service.
See its documentation to learn how to invoke the re-configuration process
of a started service instance. Also, consider using the standard client
application — [`exonum-launcher`][exonum-launcher].

A service that does not need the same protocol for its reconfiguration as
for consensus reconfiguration may implement it itself as a set of transactions.

### Dependencies Management

Exonum uses [Guice][guice-home] to describe the dependencies of the service
components (both system-specific ones, for example, Exonum time service,
and external ones).
Each service should define a Guice module describing implementations of
the `Service` and its dependencies, if any.

A service module shall:

  1. extend [`AbstractServiceModule`][abstract-service-module-javadoc]
  2. be annotated with `@org.pf4j.Extension`.
  3. be `public`.

!!! note "Minimalistic Example of Service Module"
    ```java

    @Extension
    public class ServiceModule extends AbstractServiceModule {

      @Override
      protected void configure() {
        // Define the Service implementation.
        bind(Service.class).to(CryptocurrencyService.class).in(Singleton.class);
      }
    }
    ```

The fully-qualified name of the module class is recorded in the service artifact
metadata and is used by the framework to instantiate services.

For more information on using Guice, see the [project wiki][guice-wiki].

[abstract-service-module-javadoc]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/core/service/AbstractServiceModule.html

## Testing

Exonum Java Binding provides a powerful testing toolkit —
[`exonum-testkit`][testkit-maven] library. TestKit allows testing transaction
execution in the synchronous environment by offering simple network emulation
(that is, without consensus algorithm and network operation involved).

### Project Configuration

!!! note "New projects"
    `exonum-testkit` is already included in projects generated with
    [`exonum-java-binding-service-archetype`](#creating-project) and you can
    skip the following instructions.

For existing projects include the following dependency into your `pom.xml`:

```xml
<dependency>
  <groupId>com.exonum.binding</groupId>
  <artifactId>exonum-testkit</artifactId>
  <version>0.9.0-rc2</version>
  <scope>test</scope>
</dependency>
```

As the TestKit uses a library with the implementation of native methods,
pass `java.library.path` system property to JVM:

```none
-Djava.library.path="${EXONUM_HOME}/lib/native"
```

`EXONUM_HOME` environment variable should point at the installation location,
as specified in [“After Install”](#after-install) section.

Packaged artifact should be available for integration tests that use TestKit,
so Maven Failsafe Plugin should be configured as follows:

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-failsafe-plugin</artifactId>
    <configuration>
        <argLine>
            -Djava.library.path=${env.EXONUM_HOME}/lib/native
        </argLine>
    </configuration>
    <executions>
      <execution>
        <id>integration-test</id>
        <goals>
          <goal>integration-test</goal>
          <goal>verify</goal>
        </goals>
      </execution>
    </executions>
</plugin>
```

### Creating Test Network

To perform testing, we first need to create a network emulation – the instance
of [TestKit][testkit]. TestKit allows recreating behavior of a single full
node (a validator or an auditor) in an emulated Exonum blockchain network.

To instantiate the TestKit, use [`TestKit.Builder`][testkit-builder]. It allows
configuration of:

- Type of the emulated node (either [Validator][validator] or
  [Auditor][auditor])
- Service artifacts - artifact ID and filename
- Directory that stores service artifacts
- Service instances with which the TestKit is instantiated - their
  artifact ID, service instance name, service instance ID and an optional
  service configuration
- [`TimeProvider`][testkit-time-provider] if usage of [Time Oracle][time-oracle]
  is needed (for details see [Time Oracle Testing](#time-oracle-testing))
- Number of validators in the emulated network

!!! note
    Note that regardless of the configured number of validators, only a single
    node will be emulated. This node will create the service instances, execute
    operations of those instances (e.g.,
    [`afterCommit(BlockCommittedEvent)`][service-after-commit] method logic),
    and provide access to their state.

Default TestKit can be instantiated with a single validator as an emulated
node, a single service with no configuration and without Time Oracle. To
instantiate the TestKit do the following:

<!--codeinclude-->
[](../../code-examples/java/exonum-java-binding/site-examples/src/test/java/com/exonum/binding/example/testing/TestkitExamplesTest.java)
inside_block:testkitInstantiationForSingleService
<!--/codeinclude-->

The TestKit can be also instantiated using a builder, if different
configuration is needed:

<!--codeinclude-->
[](../../code-examples/java/exonum-java-binding/site-examples/src/test/java/com/exonum/binding/example/testing/TestkitExamplesTest.java)
inside_block:testkitInstantiationUsingBuilder
<!--/codeinclude-->

In TestKit code examples, `ARTIFACT_ID`, `ARTIFACT_FILENAME`, and
`ARTIFACTS_DIRECTORY` are constants defining the corresponding
properties of the artifact and the environment. As the values of these
properties are usually defined in the build configuration, it is recommended
to pass them to the test from the build configuration (e.g., via system
properties set in `maven-failsafe-plugin`).

### Transactions Testing

The TestKit allows testing transaction execution by submitting blocks with the
given [transaction messages][transactions-messages]. Here is an example of a
test that verifies the execution result of a valid transaction and the changes
it made in service schema:

<!--codeinclude-->
[Valid tx execution test](../../code-examples/java/exonum-java-binding/site-examples/src/test/java/com/exonum/binding/example/testing/TestkitExamplesTest.java)
inside_block:validTransactionExecutionTest
<!--/codeinclude-->

And a test that verifies that a transaction that throws an exception during its
execution will fail:

<!--codeinclude-->
[Error tx execution test](../../code-examples/java/exonum-java-binding/site-examples/src/test/java/com/exonum/binding/example/testing/TestkitExamplesTest.java)
inside_block:errorTransactionExecutionTest
<!--/codeinclude-->

The TestKit also allows creating blocks that contain all current [in-pool][in-pool]
transactions. In the example below, a service that submits a transaction in its
`afterCommit` method is instantiated. Such transactions are placed into the
transaction pool and committed with [`createBlock()`][testkit-create-block]
method:

<!--codeinclude-->
[](../../code-examples/java/exonum-java-binding/site-examples/src/test/java/com/exonum/binding/example/testing/TestkitExamplesTest.java)
inside_block:createInPoolTransactions
<!--/codeinclude-->

The TestKit provides [`getTransactionPool()`][testkit-get-pool] and
[`findTransactionsInPool(Predicate<TransactionMessage> predicate)`][testkit-find-in-pool]
methods to inspect the transaction pool. These methods are useful when there is
a need to verify transactions that the service instance submitted itself (e.g.,
in `afterCommit` method) into the transaction pool.

!!! note
    Note that blocks that are created with
    [`TestKit.createBlockWithTransactions(Iterable<TransactionMessage> transactionMessages)`][testkit-create-block-with-transactions]
    will ignore in-pool transactions. As of 0.9.0-rc2, there is no way to create
    a block that would contain both given and in-pool transactions with a single
    method.

#### Checking the Blockchain State

In order to test service read operations and verify changes in the blockchain
state, the TestKit provides a snapshot of the current database state (i.e., the
one that corresponds to the latest committed block). There are several ways to
access it:

- `Snapshot getSnapshot()`
  Returns a snapshot of the current database state
- `void withSnapshot(Consumer<Snapshot> snapshotFunction)`
  Performs the given function with a snapshot of the current database state
- `<ResultT> ResultT applySnapshot(Function<Snapshot, ResultT> snapshotFunction)`
  Performs the given function with a snapshot of the current database state and
  returns a result of its execution

Read operations can also be tested through service web [API](#api).

!!! note
    Note that `withSnapshot` and `applySnapshot` methods destroy the snapshot
    once the passed closure completes. When using `getSnapshot`, created
    snapshots are only disposed when the TestKit is closed. That might cause
    excessive memory usage if many snapshots are created. Therefore, it is
    recommended to use the first two methods if a large number (e.g. more than
    a hundred) of snapshots needs to be created.

### Time Oracle Testing

The TestKit allows to use [Time Oracle][time-oracle] in integration tests if
your service depends on it. To do that, the TestKit should be created with
[`TimeProvider`][testkit-time-provider].
Its implementation, [`FakeTimeProvider`][testkit-fake-time-provider], mocks the
source of the external data (current time) and, therefore, allows to manually
manipulate time that is returned by the time service. Note that the time must
be set in UTC time zone. When tests do not need to control the current time,
[system time provider][system-time-provider] might be used.

<!--codeinclude-->
[Controlling the current time of the Time Oracle](../../code-examples/java/exonum-java-binding/site-examples/src/test/java/com/exonum/binding/example/testing/TestkitExamplesTest.java)
inside_block:ci_timeOracleTest
<!--/codeinclude-->

### TestKit JUnit 5 Extension

The TestKit JUnit 5 extension simplifies writing tests that use TestKit. It
allows to inject TestKit objects into test cases as a parameter and delete them
afterwards. To enable it, define a [`TestKitExtension`][testkit-extension]
object annotated with [`@RegisterExtension`][junit-register-extension] and
provided with a builder. The builder would be used to construct the injected
TestKit objects:

<!--codeinclude-->
[](../../code-examples/java/exonum-java-binding/site-examples/src/test/java/com/exonum/binding/example/testing/TestkitExamplesTest.java)
inside_block:ci_registerExtension
<!--/codeinclude-->

It is possible to configure the injected TestKit instance with the following annotations:

- [`@Validator`][testkit-extension-validator] sets an emulated TestKit node
  type to validator
- [`@Auditor`][testkit-extension-auditor] sets an emulated TestKit node type to
  auditor
- [`@ValidatorCount`][testkit-extension-validatorcount] sets a number of the
  validator nodes in the TestKit network

These annotations should be applied on the TestKit parameter:

<!--codeinclude-->
[](../../code-examples/java/exonum-java-binding/site-examples/src/test/java/com/exonum/binding/example/testing/TestkitExamples2Test.java)
inside_block:TestkitExamples2Test
<!--/codeinclude-->

!!! note
    Note that after the TestKit is instantiated in the given test context, it
    is not possible to reconfigure it again. For example, if the TestKit is
    injected in [`@BeforeEach`][junit-beforeeach] method, it can't be
    reconfigured in [`@Test`][junit-test] or [`@AfterEach`][junit-aftereach]
    methods. Also note that the TestKit cannot be injected in
    [`@BeforeAll`][junit-beforeall] and [`@AfterAll`][junit-afterall] methods.

### API

There are two ways to test API. First, API can be tested with unit tests by
means of service mocks. TestKit is not required for these tests. Second, API
can be tested with integration tests that use TestKit. For these tests TestKit
provides the [`getPort()`][testkit-get-port] method that retrieves a TCP port
to interact with the service REST API.

With either approach, you can use any HTTP client to send requests.

To unit test API implemented with Vertx tools, use the tools described in the
[project documentation](https://vertx.io/docs/vertx-junit5/java).

An example of API service tests can be found in
[`ApiControllerTest`][apicontrollertest].

[apicontrollertest]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.9.0-rc2/exonum-java-binding/cryptocurrency-demo/src/test/java/com/exonum/binding/cryptocurrency/ApiControllerTest.java
[auditor]: ../glossary.md#auditor
[in-pool]: ../advanced/consensus/specification.md#pool-of-unconfirmed-transactions
[junit-afterall]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/AfterAll.html
[junit-aftereach]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/AfterEach.html
[junit-beforeall]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/BeforeAll.html
[junit-beforeeach]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/BeforeEach.html
[junit-register-extension]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/extension/RegisterExtension.html
[junit-test]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/Test.html
[system-time-provider]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/TimeProvider.html#systemTime()
[testkit]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/TestKit.html
[testkit-builder]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/TestKit.Builder.html
[testkit-create-block]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/TestKit.html#createBlock()
[testkit-create-block-with-transactions]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/TestKit.html#createBlockWithTransactions(java.lang.Iterable)
[testkit-extension]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/TestKitExtension.html
[testkit-extension-auditor]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/Auditor.html
[testkit-extension-validator]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/Validator.html
[testkit-extension-validatorcount]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/ValidatorCount.html
[testkit-fake-time-provider]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/FakeTimeProvider.html
[testkit-find-in-pool]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/TestKit.html#findTransactionsInPool(java.util.function.Predicate)
[testkit-get-pool]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/TestKit.html#getTransactionPool()
[testkit-get-port]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/TestKit.html#getPort()
[testkit-maven]: https://mvnrepository.com/artifact/com.exonum.binding/exonum-testkit/0.9.0-rc2
[testkit-time-provider]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/testkit/TimeProvider.html
[validator]: ../glossary.md#validator
[vertx-web-client]: https://vertx.io/docs/vertx-web-client/java

## Using Libraries

An Exonum service can use any third-party library as its dependency.
At the same time, Exonum comes with its own dependencies.
Classes of these dependencies are used in Exonum public APIs:

- Exonum (exonum-java-binding-core, exonum-java-binding-common,
  exonum-time-oracle, exonum-testkit)
- [Guice][guice-home]
- [Gson][gson]
- [Vertx][vertx-web-docs] (vertx-web)
- [Protobuf Java](https://github.com/protocolbuffers/protobuf/tree/master/java)
- [Log4j 2][log4j2]
- [PF4J](https://pf4j.org)

Said dependencies are provided by the framework and must be used as provided.
They will not be changed in an incompatible way in a compatible Exonum release.
An up-to-date list is also available in the Exonum [bill of materials][bom] (BOM).

<!-- Otherwise multiple incompatible versions of the same class
will be loaded by the plugin classloader and the application classloader, if they
happen to need the same class -->

On top of that, Guava *can* be and is recommended to be used as a provided
library. <!-- because of its considerable size -->

!!! note
    These dependencies do not have to be declared explicitly
    because any service depends on "exonum-java-binding-core"
    which has them as transitive dependencies.

These libraries must not be packaged into the service artifact.
To achieve that in Maven, use the [`provided`][maven-provided-scope]
Maven dependency scope in the dependency declarations if you would
like to specify them explicitly.

[gson]: https://github.com/google/gson
[log4j2]: https://logging.apache.org/log4j/2.x/
[bom]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.9.0-rc2/exonum-java-binding/bom/pom.xml
[maven-provided-scope]: https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html#Dependency_Scope

## How to Build a Service Artifact

Exonum Java services are packaged as JAR archives with some extra metadata,
required to identify the service and instantiate it.

If you used the [service archetype](#creating-project) to generate
the project template, the build definition already contains
all the required configuration. Hence you can invoke `mvn verify`
and use the produced service artifact.

<!-- This paragraph is intended for users who don't use the archetype
and/or need to make non-trivial changes to the build definition (e.g.,
shade dependencies)-->
In case the service build definition needs to be configured, ensure that
the following required metadata is present in the service artifact JAR:

- Entries in the JAR manifest:
    - "Plugin-Id": must be set to "1:groupId/artifactId:version", e.g.,
    `1:com.exonum.example.timestamping/timestamping-demo:1.0.2`.
    - "Plugin-Version": must be set to the project version, e.g., `1.0.2`.
- A fully-qualified name of the [service module](#dependencies-management) class
  in "META-INF/extensions.idx" file. This file is automatically generated
  by the annotation processor of `@Extension`.

## Built-In Services

Currently Java Binding includes the following built-in services:

- [**Supervisor Service.**][supervisor-service]
  The Supervisor service is the main service of Exonum. It is capable of
  deploying and starting new services.

- [**Anchoring Service.**](../advanced/bitcoin-anchoring.md)
  The anchoring service writes the hash of the current Exonum blockchain state
  to the Bitcoin blockchain with a certain time interval. The anchored data is
  authenticated by a supermajority of validators using digital signature tools
  available in Bitcoin.

- [**Time Oracle.**][time-oracle]
  Time oracle allows user services to access the calendar time supplied by
  validator nodes to the blockchain.

## Node Configuration

Exonum offers a three-step way of the node configuration process. It allows
setting up a network of multiple nodes with multiple administrators without any
risk of private keys leakage.

Exonum Java App offers the same configuration process as standard Exonum Rust
services. In this guide we will describe how to configure a network of a single
node.

Exonum Java App includes help for each of the available commands and its
options. Use a `-h` flag for the short version of the CLI documentation, a
`--help` flag for the detailed one. `exonum-java <command-name> --help` will
print a detailed description of a specific command.

All paths in Exonum Java App CLI arguments are either absolute, or relative to
the current working directory.

### Step 1. Generate Template Config

First, we generate a common (also known as "template") part of the node
configuration. Run this command only once per network, and distribute the
resulting file among every node for the next step. However,
the resulting file is not machine-specific and depends on the passed arguments
only. Therefore, each administrator can run this command locally without
distributing the file.

Provide a path to the resulting configuration file and a number of validator
nodes in the network.

Optional `supervisor-mode` parameter denotes the mode of the
[Supervisor service][supervisor-service]. Possible values are "simple" or
"decentralized". If no parameter is supplied, "simple" is used.

```sh
exonum-java generate-template \
    testnet/common.toml \
    --supervisor-mode "simple" \
    --validators-count=1
```

### Step 2. Generate Node Private and Public Configs

<!-- TODO: add a link to Exonum docs for passwords passing -->

**Note:** the following examples omit setting up a password for private
node keys protection and pass a `--no-password` flag. It is strictly recommended
__not__ to use this flag in production.

Second, we generate both private and public parts of the node
configuration. Public part of the configuration must be distributed among every
other administrator for the next step. Private parts must not be exposed to the
outer world and are node-specific.

Provide a path to the common configuration file, a path to the directory for the
generated configuration files and an external socket address of the node to
use them for communication between the nodes.

```sh
exonum-java generate-config \
    testnet/common.toml \
    testnet \
    --no-password \
    --peer-address 127.0.0.1:5400
```

### Step 3. Finalize Configuration

Third, combine private part of the node configuration
and the public parts of the configuration of each node in the network.

Provide a path to the private part of the node configuration, a path to the
resulting node configuration file and a list of paths to the public
configuration files of every node.

```sh
exonum-java finalize \
    testnet/sec.toml \
    testnet/node.toml \
    --public-configs testnet/pub.toml
```

After completing each of the steps, the `testnet/node.toml` file contains the
final node configuration. Use this file to run the node with the specified
parameters.

### Running the Node

Unlike configuration process, `run` command of Exonum Java App is different from
the similar Exonum Rust command.

There are several required parameters here:

- `--db-path` for a path to the database directory.
- `--node-config` for a path to the final node configuration file.
- `--artifacts-path` for a path to the directory with the compiled service
  artifacts.
- `--ejb-port` for a port that Java services will use for communication.
  Java Binding does not use the public API address directly. Only Java services
  are accessible via this port.
- `--public-api-address` and `--private-api-address` for the socket addresses
  for the node user API. The public API address is used by users to send
  transactions and requests to the blockchain, the private one is used by node
  administrators to
  perform different maintenance actions. Setting these addresses is not strictly
  necessary for every node, but you will need available API ports for deploying
  and starting a service using `exonum-launcher`.

There are also optional parameters useful for debugging purposes, logging
configuration and JVM fine tuning:

- `--jvm-args-prepend` and `--jvm-args-append` are additional parameters for the
  JVM that prepend and append the rest of arguments. Must not have a leading
  dash. For example, `Xmx2G`.
- `--jvm-debug` allows remotely debugging the JVM over the JDWP protocol.
  Takes a socket address as a parameter in the following form — `HOSTNAME:PORT`.
  For example, `localhost:8000`.
- `--ejb-log-config-path` for a path to Log4j two configuration files. The
  default config `log4j-fallback.xml` provided with Exonum Java app prints to
  STDOUT. See [Logging Configuration](#logging-configuration) for more
  information.

```sh
exonum-java run \
    --db-path testnet/db \
    --node-config testnet/node.toml \
    --artifacts-path artifacts \
    --ejb-port 7000 \
    --ejb-log-config-path "log4j.xml" \
    --master-key-pass pass \
    --public-api-address 127.0.0.1:3000 \
    --private-api-address 127.0.0.1:3010
```

#### Changing the Used JVM

By default, Exonum Java App automatically finds the system JVM and uses it. To
change this, set the JVM installation directory as the value for the
`JAVA_HOME` environment variable.

#### Debugging the JVM

To enable remote debugging of the Java code on a running Exonum node,
pass the `--jvm-debug` option with a socket address. This address will be used
to connect a debugger:

```sh
exonum-java run -d testnet/db -c testnet/node.toml \
    --public-api-address 127.0.0.1:3000 \
    --private-api-address 127.0.0.1:3010 \
    --ejb-port 7000 \
    --jvm-debug localhost:8000
```

Now you can debug the service using any JDWP client, such as command line
JDB or a debugger built into your IDE:

```sh
jdb -attach localhost:8000 -sourcepath /path/to/source
```

## Deploy and Start the Service

Exonum Java Binding provides a way to dynamically deploy and start multiple
services without stopping the nodes in the network. This can be done by sending
particular transactions to the built-in Supervisor service. To simplify this
process for the users, it is recommended to use `exonum-launcher`.

Place the compiled service JAR files into the artifacts directory
(configured with the `artifacts-path` argument). The service files are needed
for the
whole time of their execution and cannot be moved or modified once deployed.

[`exonum-launcher`][exonum-launcher] is a Python application which
is capable of forming and sending deploy transactions to the node, following
the provided deploy configuration in the `YAML` file. `exonum-launcher` also has
additional plugins for support of different runtimes and services.

Exonum Java Binding provides two plugins:

- Exonum Java Runtime Plugin for Java services support.
- Exonum Instance Configuration Plugin for support of services with custom
  initial configuration arguments encoded with Protobuf. Such arguments are sent
  to the service on its start and are typically used to customize the behavior
  of a particular service instance.

### Launcher Installation

Follow the instructions in the [plugins Readme][plugins-readme]

To deploy and start a specific list of services, use the following command with
the prepared `config.yml` file:

```sh
python3 -m exonum_launcher -i config.yml
```

See the following section for instructions on creating the `config.yml` file for
a specific service.

### Writing the Configuration File

Start with specifying IP addresses of the blockchain nodes:

```yaml
networks:
  - host: "127.0.0.1"
    ssl: false
    public-api-port: 8080
    private-api-port: 8081
```

Specify every node for which you have access to its private API
port. If you do not have access to every node in the network, the
administrators of other nodes must run `exonum-launcher` with the same
configuration file. The list of available nodes must be adjusted by every
administrator accordingly.

The deadline height describes the maximum blockchain height for the deployment
process. Make sure to specify the value larger than the current blockchain
height.

```yaml
deadline_height: 20000
```

Enable the Java runtime by specifying its identifier (`1`). The Rust runtime is
enabled by default:

```yaml
runtimes:
  java: 1
```

Add artifacts you want to deploy. For each artifact specify its
name alias (as a YAML key) and its runtime (using the `runtime` field). Name
aliases are used in other parts of the configuration for readability and easier
refactoring. Java artifacts also need the name of the JAR file in the
`spec: artifact_filename` field of the artifacts directory. The present example
shows how to add the Java `cryptocurrency-demo` service, and two Rust services —
the `timestamping` and `time` oracle services.

```yaml
artifacts:
  cryptocurrency:
    runtime: java
    name: "com.exonum.examples:cryptocurrency-demo:0.9.0-rc2"
    spec:
      artifact_filename: "cryptocurrency-demo-0.9.0-rc2-artifact.jar"
  time:
    runtime: rust
    name: "exonum-time:0.13.0-rc.2"
  timestamping:
    runtime: rust
    name: "exonum-timestamping:0.13.0-rc.2"
```

Add a `plugins` section to enable both Java Runtime plugin and Instance
Configuration plugin. The runtime plugin is enabled for a specific runtime
(`java` in the present example). The Instance Configuration plugin is
enabled for a specific artifact name alias (`timestamping` in the present
example).

```yaml
plugins:
  runtime:
    java: "exonum_java_runtime_plugin.JavaDeploySpecLoader"
  artifact:
    timestamping: "exonum_instance_configuration_plugin.InstanceSpecLoader"
```

The present example uses the Instance Configuration plugin to serialize
initial configuration parameters of the `timestamping` service in Protobuf.
Take a `service.proto` file with the message description from the
service sources and place it inside some known directory.

  ```proto
  syntax = "proto3";

  package exonum.examples.timestamping;

  message Config {
      string time_service_name = 1;
  }
  ```

Finally, add an `instances` section that describes the list of service instances
you want to start in the blockchain. For each instance specify its
artifact name alias in the `artifact` field. Instance names are the keys in the
YAML dictionary.

```yaml
instances:
  xnm-token:
    artifact: cryptocurrency
  time-oracle:
    artifact: time
```

To instantiate a service which requires configuration parameters,
`config` dictionary must be supplied.

The Instance Configuration plugin supports several configuration formats:

- Standard text formats: text, JSON, [java.util.Properties].
- Arbitrary Protocol Buffers messages.

#### Text Configuration Formats

Requires the following parameters:

- `format`. Describes the format of the configuration string. Possible values
  are: `text`, `json` and `properties` (see [java.util.Properties]).
- `value`. A configuration string, may be used instead of `from_file`. If both
  `value` and `from_file` are present, `value` takes higher priority.
- `from_file`. A path to a file containing configuration string. May be absolute
  or relative to the working directory.

```yaml
instances:
  timestamping:
    artifact: timestamping
    config:
      format: "properties"
      from_file: "configs/timestamping.properties"
```

#### Custom Configuration Message

Requires the following parameters:

- `sources`. Points to a directory with the Protobuf sources of the service
  configuration message. The `proto_sources` directory is used.
- `config_message_source`. A file name where the `message_name` message
  is located. In the present example the `service.proto` file is used.
- `message_name`. A name of the Protobuf message used to represent the service
  configuration. Optional, defaults to `Config`.
- `data`. Your actual configuration in the format corresponding to the
  `message_name` message.

```yaml
instances:
  timestamping:
    artifact: timestamping
    config:
      sources: "proto_sources"
      config_message_source: "service.proto"
      message_name: "Config"
      data:
        time_service_name: "time"
```

See [sample-config.yml][launcher-sample-config] for the final state of the
configuration file.

[exonum-launcher]: https://github.com/exonum/exonum-launcher
[plugins-readme]: https://pypi.org/project/exonum-launcher-java-plugins/0.10.0/
[launcher-sample-config]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.9.0-rc2/exonum-java-binding/exonum_launcher_java_plugins/sample-config.yml

## Logging Configuration

Java Binding uses two different methods for logging — [`Log4J`][log4j-home]
in Java modules and [`env_logger`][env_logger-home] in Rust modules.

### Rust Logging

Rust logs are produced by Exonum Core and can be used to monitor the
status of the blockchain node, including information about the block
commitment and the consensus status.

Rust logs are disabled by default and controlled by the `RUST_LOG`
environment variable. It is recommended to set `info` logging level
for Exonum modules and `warn` level for all other modules:

```bash
export RUST_LOG=warn,exonum=info,exonum-java=info
```

Log entries go to `stderr` by default.

See [`env_logger` documentation][env_logger-docs] for more information
on possible configuration options.

### Java Logging

Logs produced by Java code (the framework and its dependencies,
and the deployed services) are handled by Log4J framework.
The services can use either [`Log4J`][log4j-home] or
[`SLF4J`][slf4j-home] logging APIs.

Java logging configuration is controlled by the configuration file
specified by the optional [`ejb-log-config-path`](#running-the-node) parameter.
If no file is provided, the default `log4j-fallback.xml` configuration file from
the installation directory is used. This file allows printing `INFO`-level
messages to STDOUT.

See [`Log4J` documentation][log4j-docs] for more information on
possible configuration options.

## Common Library

Java Binding includes a library module that can be useful for Java client
applications that interact with an Exonum service. The module does not
have the dependency on Java Binding Core, but it contains Java classes
obligatory for the core that can as well be easily used in clients,
if necessary.
The library provides the ability to create transaction messages, check proofs,
serialize/deserialize data and perform cryptographic operations.
For using the library just include the dependency in your `pom.xml`:

``` xml
    <dependency>
      <groupId>com.exonum.binding</groupId>
      <artifactId>exonum-java-binding-common</artifactId>
      <version>0.9.0-rc2</version>
    </dependency>
```

## Known Limitations

- Custom Rust services can be added to the application only by modifying and
  rebuilding thereof.
- Exonum Java application does not support Windows yet.

## See Also

- [Javadocs](https://exonum.com/doc/api/java-binding/0.9.0-rc2/index.html)
- [Vehicle Registry Tutorial](first-java-service.md)

[abstract-service]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/core/service/AbstractService.html
[blockchain]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/core/blockchain/Blockchain.html
[brew-install]: https://docs.brew.sh/Installation
[build-description]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.9.0-rc2/exonum-java-binding/service-archetype/src/main/resources/archetype-resources/pom.xml
[configurable]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/core/service/Configurable.html
[docker-for-windows]: https://docs.docker.com/docker-for-windows/
[env_logger-docs]: https://docs.rs/env_logger/0.6.2/env_logger/#enabling-logging
[env_logger-home]: https://crates.io/crates/env_logger
[Exonum-services]: ../architecture/services.md
[github-releases]: https://github.com/exonum/exonum-java-binding/releases
[guice-home]: https://github.com/google/guice
[guice-wiki]: https://github.com/google/guice/wiki/GettingStarted
[homebrew]: https://github.com/Homebrew/brew#homebrew
[how-to-build]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.9.0-rc2/CONTRIBUTING.md#how-to-build
[java.util.Properties]: https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/Properties.html#load(java.io.Reader)
[jdk]: https://jdk.java.net/
[libsodium]: https://download.libsodium.org/doc/
[log4j-docs]: https://logging.apache.org/log4j/2.x/manual/index.html
[log4j-home]: https://logging.apache.org/log4j
[schema]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/core/service/Schema.html
[service]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/core/service/Service.html
[service-after-commit]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/core/service/Service.html#afterCommit(com.exonum.binding.service.BlockCommittedEvent)
[service-before-transactions]: https://exonum.com/doc/api/java-binding/0.10.0/com/exonum/binding/core/service/Service.html#beforeTransactions(com.exonum.binding.core.blockchain.BlockchainData)
[service-after-transactions]: https://exonum.com/doc/api/java-binding/0.10.0/com/exonum/binding/core/service/Service.html#afterTransactions(com.exonum.binding.core.blockchain.BlockchainData)
[node-submit-transaction]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/core/service/Node.html#submitTransaction(com.exonum.binding.transaction.RawTransaction)
[slf4j-home]: https://www.slf4j.org/
[standard-serializers]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/common/serialization/StandardSerializers.html
[standard-supervisor-rustdoc]: https://docs.rs/exonum-supervisor/0.13.0-rc.2/exonum_supervisor/
[storage-indices]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/core/storage/indices/package-summary.html
[supervisor-service]: ../advanced/supervisor.md
[time-oracle]: ../advanced/time.md
[transaction]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/core/transaction/Transaction.html
[execution-context]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/core/service/ExecutionContext.html
[transactions]: ../architecture/transactions.md
[transactions-messages]: ../architecture/transactions.md#messages
[vertx-web-docs]: https://vertx.io/docs/vertx-web/java/#_basic_vert_x_web_concepts
[maven-install]: https://maven.apache.org/install.html
[service-create-public-api]: https://exonum.com/doc/api/java-binding/0.9.0-rc2/com/exonum/binding/core/service/Service.html#createPublicApiHandlers(com.exonum.binding.core.service.Node,io.vertx.ext.web.Router)
[WSL]: https://docs.microsoft.com/en-us/windows/wsl/about
