# Java Binding User Guide

**Exonum Java App** is an application that includes the Exonum framework
and Java services runtime environment.

## Installation

To run a node with your Java service you need to use Exonum Java application.

There are several installation options:

- [Manual installation](#manual-installation) — available for Mac OS and Linux
- [Homebrew package](#homebrew-package) — available for Mac OS only,
  recommended for Mac users
- [Build from source](#build-from-source) — available for Mac OS and Linux

### Manual Installation

You can download an archive containing the application and
all the necessary dependencies on [the Releases page][github-releases] on GitHub.
We suggest using `debug` version during development and `release` version for
deployment.

- Download and unpack the archive from the [Releases page][github-releases]
  into some known location. To install the latest release to `~/bin`:

  ```bash
  mkdir -p ~/bin
  cd ~/bin
  unzip /path/to/downloaded/exonum-java-0.8.0-release.zip
  ```

- Install [Libsodium][libsodium] as the necessary runtime dependency.

!!! note
    Exonum Java is built with Libsodium 23, which means it will not work
    on some older Linux distributions, like Ubuntu 16.04. Libsodium 23 is
    available in Ubuntu 18.04 or can be installed from a custom PPA.

??? example "Linux (Ubuntu)"
    ```bash
    sudo apt-get update && sudo apt-get install libsodium-dev
    ```

??? example "Mac OS"
    ```bash
    brew install libsodium
    ```

- Follow the steps in the [After Install](#after-install) section below

### Homebrew Package

For Mac users, we provide a [Homebrew][homebrew] repository, which gives the
easiest way of installing Exonum Java App:

```bash
brew tap exonum/exonum
brew install exonum-java
```

This will install `exonum-java` binary with all the necessary dependencies.
However, you still need to install [Maven 3][maven-install] and follow the
steps mentioned in [After Install](#after-install) section below.

### Build from Source

It is also possible to build Exonum Java application from sources. To do so,
follow the instructions in [Contribution Guide][how-to-build].

### After Install

- Create an environment variable `EXONUM_HOME` pointing at installation
  location.

  ```bash
  # The path is provided in after-install message in case of Homebrew
  export EXONUM_HOME=~/bin/exonum-java-0.8.0-release
  # Setting PATH variable is not needed in case of Homebrew
  export PATH="$PATH:$EXONUM_HOME/bin"
  ```

- Install [Maven 3][maven-install] which is essential for developing and building
  Java service.

## Creating Project

The easiest way to create a Java service project is to use a template project
generator. After [installing Maven 3][maven-install], run the command:

``` none
mvn archetype:generate \
    -DinteractiveMode=false \
    -DarchetypeGroupId=com.exonum.binding \
    -DarchetypeArtifactId=exonum-java-binding-service-archetype \
    -DarchetypeVersion=0.8.0 \
    -DgroupId=com.example.myservice \
    -DartifactId=my-service \
    -Dversion=1.0.0
```

You can also use the interactive mode:

``` none
mvn archetype:generate \
    -DarchetypeGroupId=com.exonum.binding \
    -DarchetypeArtifactId=exonum-java-binding-service-archetype \
    -DarchetypeVersion=0.8.0
```

The build definition files for other build systems (e.g., [Gradle](https://gradle.org/))
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
abstract class [`AbstractService`][abstractservice].

### Schema Description

Exonum provides several collection types to persist service data. The main
types are sets, lists and maps. Data organization inside the
collections is arranged in two ways – ordinary collections and
[Merkelized collections](../architecture/storage.md#merkelized-indices);
the latter allow
providing cryptographic evidence of the authenticity of data to the clients of
the system (for example, that an element is stored in the collection under a
certain key). The [blockchain state](../glossary.md#blockchain-state) is
influenced only by the Merkelized collections.

For the detailed description of all Exonum collection types see the
corresponding [documentation section](../architecture/storage.md#table-types).
In Java, implementations of collections are located in
[a separate package][storage-indices]. Said package documentation
describes their use.

!!! note
    `SparseListIndex` is not yet supported in Java. Let us know if it may be
    useful for you!

Collections work with a database view – either `Snapshot`, which is read-only
and represents the database state as of the latest committed block;
or `Fork`, which is mutable and allows performing modifying operations. The
database view is provided by the framework: `Snapshot` can be
requested at any time, while `Fork` – only when the transaction is executed. The
lifetime of these objects is limited by the scope of the method to which they
are passed to.

Exonum stores elements in collections as byte arrays. Therefore,
serializers for values stored in collections must be provided.
See [Serialization](#serialization) for details.

!!! note "Example of ProofMapIndex Creation"
    ```java
    void updateBalance(Fork fork, String serviceInstanceName) {
      var name = serviceInstanceName + ".balanceById";
      var balanceById = ProofMapIndexProxy.newInstance(name, fork,
          StandardSerializers.hash(),
          StandardSerializers.longs());
      balanceById.put(id, newBalance);
    }
    ```

A set of named collections constitute a *service schema*. Collections shall be
defined in a unique to all service instances namespace to avoid name collisions;
that is usually achieved by adding a prefix to the name of each collection,
declared in the service (e.g., an assigned service name: `"timestamping.timestamps"`).
For convenient access to service collections you can implement a factory
of service collections.

*The state of the service in the blockchain* is determined by the list of hashes.
Usually, it is comprised of the hashes of its Merkelized collections. State hashes
of each service are aggregated in a single blockchain state hash, which is included
in each committed block. When using `AbstractService`, the hash list must be defined
in the schema class that implements [`Schema`][schema] interface; when implementing
`Service` directly – in the service itself.

!!! note "Example of a Service Schema with a single Merkelized collection"

    ```java
    class FooSchema implements Schema {
      private final String namespace;
      private final View view;

      /**
       * Creates a schema belonging to the service instance with the given name.
       * The database state is determined by the given view.
       */
      FooSchema(String serviceName, View view) {
        /* Use a service name as a namespace to distinguish
           collections of this service instance from other instances
           and enable multiple services of the same type. */
        this.namespace = serviceName;
        this.view = view;
      }

      @Override
      public List<HashCode> getStateHashes() {
        /* This schema has a single Merkelized map which contents
           must be verified by the consensus algorithm to be the same
           on each node. Hence we return the index hash of this collection. */
        return Collections.singletonList(testMap().getIndexHash());
      }

      /**
       * Creates a test ProofMap.
       *
       * <p>Such factory methods may be used in transactions and read requests
       * to create a collection of a certain type and name. Here,
       * a ProofMap with String keys and values is created with a full name
       * "<service name>.test-map".
       */
      ProofMapIndexProxy<String, String> testMap() {
        var fullName = fullIndexName("test-map");
        return ProofMapIndexProxy.newInstance(fullName, view, string(),
            string());
      }

      /** Creates a full index name given its simple name. */
      private String fullIndexName(String name) {
        return namespace + "." + name;
      }
    }
    ```

#### Serialization

As Exonum storage accepts data in the form of byte arrays,
storing user data requires serialization.
Java Binding provides a set of built-in *serializers* that you can find
in the [`StandardSerializers`][standardserializers] utility class.
The list of serializers covers the most often-used entities and includes:

- Standard types: `boolean`, `float`, `double`, `byte[]` and `String`.
  Integers with various encoding types,
  see [`StandardSerializers`][standardserializers] Java documentation
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

For more details about transactions in Exonum – their properties and processing
rules – see the corresponding section of our [documentation][transactions].

#### Messages

Transactions are transmitted by external service clients to the framework as
[Exonum messages][transactions-messages].
A transaction message contains:

- a header with the identifying information, such as a numeric ID
of the service instance which shall process this transaction
and a transaction ID within that service;
- a payload containing transaction parameters;
- a public key of the author, and a signature that authenticates them.

The transaction payload in the message can be serialized
using an arbitrary algorithm supported by both the service client
and the service itself.

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

Ed25519 is a standard cryptographic system for digital signing
of Exonum messages. It is available through
the [`CryptoFunctions#ed25519`][cryptofunctions-ed25519] method.

[node-configuration-validator-keys]: ../architecture/configuration.md#genesisvalidator_keys

#### Transaction Lifecycle

The lifecycle of a Java service transaction is the same as in any other
Exonum service:

1. A service client creates a transaction message, including IDs of
  the service and this transaction, serialized transaction parameters
  as a payload, and signs the message with the author’s key pair.
2. The client transmits the message to one of the Exonum nodes in the network.
  The transaction is identified by the hash of the corresponding message.
3. The node verifies the correctness of the message: its header,
  including the service ID, and its cryptographic signature
  against the author’s public key included into it.
4. If all checks pass, the node that received the message adds it to its
  local transaction pool and broadcasts the message to all the other nodes
  in the network.
5. Other nodes, having received the transaction message, perform all
  the previous verification steps, and, if they pass, add the message to
  the local transaction pool.
6. When majority of validator nodes agree to include this transaction
  into the next block, they take the message from the transaction pool and
  request the service to [execute](#transaction-execution) it.
7. When all transactions in the block are executed, all changes are atomically
  applied to the database state and a new block is committed.

The transaction messages are preserved in the database regardless of
the execution result, and can be later accessed via `Blockchain` class.
For a more detailed description of transaction processing,
see the [Transaction Lifecycle](../architecture/transactions.md#lifecycle)
section.

#### Transaction Execution

When the framework receives a transaction message, it must transform it into
an *executable transaction* to process. As every service has several transaction
types each with its own parameters, it must provide
a [`TransactionConverter`][transactionconvererter] for this purpose.
When the framework requests a service to convert a transaction,
its message is guaranteed to have a correct cryptographic signature.

An executable transaction is an instance of a class implementing
the [`Transaction`][transaction] interface and defining transaction
business logic. The interface implementations must define an execution
rule for the transaction in `execute` method.

The `Transaction#execute` method describes the operations that are applied to the
current storage state when the transaction is executed. Exonum passes
an [execution context][transaction-execution-context] as an argument.
The context provides:

- a `Fork` – a view that allows performing modifying operations;
- the service instance name and numeric ID;
- some information about the corresponding transaction message:
its SHA-256 hash that uniquely identifies it, and the author’s public key.

A service schema object can be used to access data collections of this service.

An implementation of the `Transaction#execute` method must be a pure function,
i.e. it must produce the same _observable_ result on all the nodes of the system
for the given transaction. An observable result is the one that affects the
blockchain state hash: a modification of a collection that affects the service
state hash, or an execution exception.

##### Exceptions

Transaction methods may throw `TransactionExecutionException`
to notify Exonum about an error in a transaction execution.

The `TransactionExecutionException` contains an integer error code and
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
as an "unexpected" execution error.

If transaction execution fails, the changes made by the transaction are
rolled back, while the error data is stored in the database for further user
reference. Light clients also provide access to information on the
[transaction][exonum-transaction-endpoint] execution result
(which may be either success or failure) to their users.

#### After Transactions Handler

Services can receive a notification after all transactions in a block has been
processed but before the block has been committed, allowing inspecting
the changes made by the transactions and modifying any service state.

Exonum delivers this notification to implementations
of [`Service#beforeCommit`][service-before-commit] method. The method will see
the state of the database after all transactions have been applied.
It may make any changes to the service state, which will be included
in the block. As transactions, the implementations must produce
the same observable result on all nodes of the system.
If exceptions occur in this handler, Exonum will roll back any changes made
to the persistent storage in it.

<!-- Mind that it will change in 1.0, see exonum/exonum#1576 -->
Unlike transactions, the execution result of `beforeCommit` is not saved
in the database.

### Blockchain Events

A service can also handle a block commit event that occurs each time
the framework commits a new block. The framework delivers this event to
implementations of [`Service#afterCommit(BlockCommittedEvent)`][service-after-commit]
callback in each deployed service. Each node in the network processes
that event independently from other nodes. The event includes a `Snapshot`,
allowing a read-only access to the database state _exactly_ after the commit
of the corresponding block.

As services can read the database state in the handler, they may detect
any changes in it, e.g., that a certain transaction is executed;
or some condition is met. Services may also create and submit new transactions
using [`Node#submitTransaction`][node-submit-transaction]. Using this callback
to notify other systems is another common use case, but the implementations
must pay attention to **not** perform any blocking operations such as
synchronous I/O in this handler, as it is invoked synchronously in the same
thread that handles transactions. Blocking that thread will delay transaction
processing on the node.

### Core Schema API

Users can access information stored in the blockchain by the framework using
methods of [`Blockchain`][blockchain] class. This API can be used both in
transaction code and in read requests. The following functionality is
available:

- `getHeight: long`
  The height of the latest committed block in the blockchain
- `getBlockHashes: ListIndex<HashCode>`
  The list of all block hashes, indexed by the block height
- `getBlockTransactions: ProofListIndexProxy<HashCode>`
  The proof list of transaction hashes committed in the block with the given
  height or ID
- `getTxMessages: MapIndex<HashCode, TransactionMessage>`
  The map of transaction messages identified by their SHA-256 hashes. Both
  committed and in-pool (not yet processed) transactions are returned
- `getTxResults: ProofMapIndexProxy<HashCode, ExecutionStatus>`
  The map of transaction execution results identified by the corresponding
  transaction SHA-256 hashes
- `getTxLocations: MapIndex<HashCode, TransactionLocation>`
  The map of transaction positions inside the blockchain identified by
  the corresponding transaction SHA-256 hashes
- `getBlocks: MapIndex<HashCode, Block>`
  The map of block objects identified by the corresponding block hashes
- `getLastBlock: Block`
  The latest committed block
- `getConsensusConfiguration: Config`
  The consensus configuration for the latest height of the blockchain.

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
handler for balance requests in the "cryptocurrency" service will be available
at `/api/services/cryptocurrency/balance/:walletId`.

See [documentation][vertx-web-docs] on the possibilities of `Vert.x` used as a web
framework.

### Configuration

#### Initialization and Initial Configuration

Service can initialize its persistent state on its start using
[`Service#initialize`][service-initialize].

<!-- TODO: Link to the sections on starting new services -->

Exonum invokes this method when a new service instance is added
to the blockchain. Administrators, initiating this action,
may pass some initialization parameters. A service is responsible for
validation of these parameters. If they are incorrect, it shall throw
an Exception, which will abort the start of this service instance.

A service shall also update its _persistent_ state based on these parameters.
It shall not derive the `Service` _object_ state from them, as
Exonum may instantiate multiple `Service` objects for a single
service instance (e.g., when a node is stopped and then restarted).

For example, a service may set some initial values in its collections,
or save all or some configuration parameters as is for later retrieval in transactions
and/or read requests.

<!-- TODO: example -->

#### Reconfiguration

<!-- TODO: link the complete documentation on reconfiguration,
especially in terms of its invocation by administrators -->

Exonum supervisor service provides a mechanism to reconfigure
the started service instances. The re-configuration protocol for _services_
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
of a started service instance.

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

        // Define the TransactionConverter implementation required
        // by the CryptocurrencyService.
        bind(TransactionConverter.class).to(CryptocurrencyTransactionConverter.class);
      }
    }
    ```

The fully-qualified name of the module class is recorded in the service artifact
metadata and is used by the framework to instantiate services.

For more information on using Guice, see the [project wiki][guice-wiki].

[abstract-service-module-javadoc]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/service/AbstractServiceModule.html

## Testing

Exonum Java Binding provides a powerful testing toolkit —
[`exonum-testkit`][testkit-maven] library. TestKit allows testing transaction
execution in the synchronous environment by offering simple network emulation
(that is, without consensus algorithm and network operation involved).

### Project Configuration

!!! note "New projects"
    `exonum-testkit` is already included in projects generated with
    [`exonum-java-binding-service-archetype`](#creating-project) and you can
    skip the following instructions:

For existing projects include the following dependency into your `pom.xml`:

``` xml
<dependency>
  <groupId>com.exonum.binding</groupId>
  <artifactId>exonum-testkit</artifactId>
  <version>0.8.0</version>
  <scope>test</scope>
</dependency>
```

As the TestKit uses a library with the implementation of native methods,
pass `java.library.path` system property to JVM:

``` none
-Djava.library.path=$EXONUM_JAVA/lib/native
```

`$EXONUM_JAVA` environment variable should point at installation location,
as specified in [How to Run a Service section](#how-to-run-a-service).

`Surefire/Failsafe` for Maven should be configured as follows:

```xml
<plugin>
    <!-- You can also configure a failsafe to run integration tests during
         'verify' phase of a Maven build to separate unit tests and ITs. -->
    <artifactId>maven-surefire-plugin</artifactId>
    <configuration>
        <argLine>
            -Djava.library.path=${path-to-java-bindings-library}
        </argLine>
    </configuration>
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
- Services with which the TestKit would be instantiated
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
node, a single service and without Time Oracle in the following way:

```java
try (TestKit testKit = TestKit.forService(MyServiceModule.class)) {
  // Test logic
}
```

The TestKit can be also instantiated using a builder, if different
configuration is needed:

```java
try (TestKit testKit = TestKit.builder()
    .withServices(MyServiceModule.class, MyServiceModule2.class)
    .withValidators(2)
    .build()) {
  // Test logic
}
```

### Transactions Testing

The TestKit allows testing transaction execution by submitting blocks with the
given [transaction messages][transactions-messages]. Here is an example of a
test that verifies the execution result of a valid transaction and the changes
it made in service schema:

```java
try (TestKit testKit = TestKit.forService(MyServiceModule.class)) {
  // Construct a valid transaction
  TransactionMessage validTx = constructValidTransaction();

  // Commit block with this transaction
  Block block = testKit.createBlockWithTransactions(validTx);

  // Retrieve a snapshot of the current database state
  Snapshot view = testkit.getSnapshot();
  // It can be used to access the core schema, for example to check the
  // transaction execution result:
  Blockchain blockchain = Blockchain.newInstance(view);
  Optional<TransactionResult> validTxResult =
        blockchain.getTxResult(validTx.hash());
  assertThat(validTxResult).hasValue(TransactionResult.successful());
  // And also to verify the changes the transaction made to the service state:
  MySchema schema = new MySchema(view);
  // Perform assertions on the data in the service schema
}
```

And a test that verifies that a transaction that throws an exception during its
execution will fail:

```java
try (TestKit testKit = TestKit.forService(MyServiceModule.class)) {
  // Construct a transaction that throws `TransactionExecutionException` during
  // execution
  byte errorCode = 1;
  String errorDescription = "Test";
  TransactionMessage errorTx =
      constructErrorTransaction(errorCode, errorDescription);

  // Commit block with this transaction
  Block block = testKit.createBlockWithTransactions(errorTx);

  // Check that transaction failed
  Snapshot view = testKit.getSnapshot();
  Blockchain blockchain = Blockchain.newInstance(view);

  Optional<TransactionResult> errorTxResult =
      blockchain.getTxResult(errorTx.hash());
  TransactionResult expectedTransactionResult =
      TransactionResult.error(errorCode, errorDescription);
  assertThat(errorTxResult).hasValue(expectedTransactionResult);
}
```

The TestKit also allows creating blocks that contain all current [in-pool][in-pool]
transactions:

```java
try (TestKit testKit = TestKit.forService(MyServiceModule.class)) {
  // Put the transaction into the TestKit transaction pool
  MyService service = testKit.getService(MyService.SERVICE_ID, MyService.class);

  TransactionMessage message = constructTransactionMessage();
  RawTransaction rawTransaction = RawTransaction.fromMessage(message);
  service.getNode().submitTransaction(rawTransaction);

  // This block will contain the transaction submitted above
  Block block = testKit.createBlock();
  // Check the resulting block or blockchain state
}
```

The TestKit provides [`getTransactionPool()`][testkit-get-pool] and
[`findTransactionsInPool(Predicate<TransactionMessage> predicate)`][testkit-find-in-pool]
methods to inspect the transaction pool. These methods are useful when there is
a need to verify transactions that the service instance submitted itself (e.g.,
in `afterCommit` method) into the transaction pool.

!!! note
    Note that blocks that are created with
    [`TestKit.createBlockWithTransactions(Iterable<TransactionMessage> transactionMessages)`][testkit-create-block]
    will ignore in-pool transactions. As of 0.8.0, there is no way to create a block
    that would contain both given and in-pool transactions with a single
    method. To do that, put the given transactions into the TestKit transaction
    pool with [`Node.submitTransaction(RawTransaction rawTransaction)`][node-submit-transaction].

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
be set in UTC time zone.

```java
@Test
void timeOracleTest() {
  ZonedDateTime initialTime = ZonedDateTime.now(ZoneOffset.UTC);
  FakeTimeProvider timeProvider = FakeTimeProvider.create(initialTime);
  try (TestKit testKit = TestKit.builder()
      .withService(MyServiceModule.class)
      .withTimeService(timeProvider)
      .build()) {
    // Create an empty block
    testKit.createBlock();
    // The time service submitted its first transaction in `afterCommit`
    // method, but it has not been executed yet
    Optional<ZonedDateTime> consolidatedTime1 = getConsolidatedTime(testKit);
    // No time is available till the time service transaction is processed
    assertThat(consolidatedTime1).isEmpty();

    // Increase the time value
    ZonedDateTime time1 = initialTime.plusSeconds(1);
    timeProvider.setTime(time1);
    testKit.createBlock();
    // The time service submitted its second transaction. The first must
    // have been executed, with consolidated time now available and equal to
    // initialTime
    Optional<ZonedDateTime> consolidatedTime2 = getConsolidatedTime(testKit);
    assertThat(consolidatedTime2).hasValue(initialTime);

    // Increase the time value
    ZonedDateTime time2 = initialTime.plusSeconds(1);
    timeProvider.setTime(time2);
    testKit.createBlock();
    // The time service submitted its third transaction, and processed the
    // second one. The consolidated time must be equal to time1
    Optional<ZonedDateTime> consolidatedTime3 = getConsolidatedTime(testKit);
    assertThat(consolidatedTime3).hasValue(time1);
  }
}

private Optional<ZonedDateTime> getConsolidatedTime(TestKit testKit) {
  return testKit.applySnapshot(s -> {
    TimeSchema timeSchema = TimeSchema.newInstance(s);
    return timeSchema.getTime().toOptional();
  });
}
```

### TestKit JUnit 5 Extension

The TestKit JUnit 5 extension simplifies writing tests that use TestKit. It
allows to inject TestKit objects into test cases as a parameter and delete them
afterwards. To enable it, define a [`TestKitExtension`][testkit-extension]
object annotated with [`@RegisterExtension`][junit-register-extension] and
provided with a builder. The builder would be used to construct the injected
TestKit objects:

```java
@RegisterExtension
TestKitExtension testKitExtension = new TestKitExtension(
  TestKit.builder()
    .withService(MyServiceModule.class));

@Test
void test(TestKit testKit) {
  // Test logic
}
```

It is possible to configure the injected TestKit instance with the following annotations:

- [`@Validator`][testkit-extension-validator] sets an emulated TestKit node
  type to validator
- [`@Auditor`][testkit-extension-auditor] sets an emulated TestKit node type to
  auditor
- [`@ValidatorCount`][testkit-extension-validatorcount] sets a number of the
  validator nodes in the TestKit network

These annotations should be applied on the TestKit parameter:

```java
@RegisterExtension
TestKitExtension testKitExtension = new TestKitExtension(
  TestKit.builder()
    .withService(MyServiceModule.class));

@Test
void validatorTest(TestKit testKit) {
  // Injected TestKit has a default configuration, specified in the builder
  // above
}

@Test
void auditorTest(@Auditor @ValidatorCount(8) TestKit testKit) {
  // Injected TestKit has an altered configuration — "auditor" as an emulated
  // node and 8 validator nodes
}
```

!!! note
    Note that after the TestKit is instantiated in the given test context, it
    is not possible to reconfigure it again. For example, if the TestKit is
    injected in [`@BeforeEach`][junit-beforeeach] method, it can't be
    reconfigured in [`@Test`][junit-test] or [`@AfterEach`][junit-aftereach]
    methods. Also note that the TestKit cannot be injected in
    [`@BeforeAll`][junit-beforeall] and [`@AfterAll`][junit-afterall] methods.

### API

To test API implemented with Vertx tools, use the tools described in the
[project documentation](https://vertx.io/docs/vertx-junit5/java).
You can use [Vertx Web Client][vertx-web-client] as a client or a different
HTTP client.

An example of API service tests can be found in
[`ApiControllerTest`][apicontrollertest].

[apicontrollertest]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.8.0/exonum-java-binding/cryptocurrency-demo/src/test/java/com/exonum/binding/cryptocurrency/ApiControllerTest.java
[auditor]: ../glossary.md#auditor
[in-pool]: ../advanced/consensus/specification/#pool-of-unconfirmed-transactions
[junit-afterall]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/AfterAll.html
[junit-aftereach]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/AfterEach.html
[junit-beforeall]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/BeforeAll.html
[junit-beforeeach]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/BeforeEach.html
[junit-register-extension]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/extension/RegisterExtension.html
[junit-test]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/Test.html
[node-submit-transaction]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/service/Node.html#submitTransaction(com.exonum.binding.transaction.RawTransaction)
[testkit]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/testkit/TestKit.html
[testkit-builder]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/testkit/TestKit.Builder.html
[testkit-create-block]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/testkit/TestKit.html#createBlockWithTransactions(java.lang.Iterable)
[testkit-extension]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/testkit/TestKitExtension.html
[testkit-extension-auditor]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/testkit/Auditor.html
[testkit-extension-validator]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/testkit/Validator.html
[testkit-extension-validatorcount]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/testkit/ValidatorCount.html
[testkit-fake-time-provider]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/testkit/FakeTimeProvider.html
[testkit-find-in-pool]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/testkit/TestKit.html#findTransactionsInPool(java.util.function.Predicate)
[testkit-get-pool]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/testkit/TestKit.html#getTransactionPool()
[testkit-maven]: https://mvnrepository.com/artifact/com.exonum.binding/exonum-testkit/0.8.0
[testkit-time-provider]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/testkit/TimeProvider.html
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
[bom]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.8.0/exonum-java-binding/bom/pom.xml
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
    - "Plugin-Id": must be set to "groupId:artifactId:version", e.g.,
    `com.exonum.example.timestamping:timestamping-demo:1.0.2`.
    - "Plugin-Version": must be set to the project version, e.g., `1.0.2`.
- A fully-qualified name of the [service module](#dependencies-management) class
  in "META-INF/extensions.idx" file. This file is automatically generated
  by the annotation processor of `@Extension`.

## How to Run a Service

- Make sure you followed the steps mentioned in [Installation section](#installation).
- Follow the instructions in the [Application Guide][app-tutorial] to configure
  and start an Exonum node with your service. The guide is provided inside the archive
  as well.

## Built-In Services

Currently Java Binding includes the following built-in services:

- [**Configuration Update Service.**](../advanced/configuration-updater.md)
  Although every node has its own configuration file, some settings should be
  changed for all nodes simultaneously. This service allows updating global
  configuration parameters of the network without stopping the nodes. The
  changes are agreed upon through the consensus mechanism.

- [**Anchoring Service.**](../advanced/bitcoin-anchoring.md)
  The anchoring service writes the hash of the current Exonum blockchain state
  to the Bitcoin blockchain with a certain time interval. The anchored data is
  authenticated by a supermajority of validators using digital signature tools
  available in Bitcoin.

- [**Time Oracle.**][time-oracle]
  Time oracle allows user services to access the calendar time supplied by
  validator nodes to the blockchain.

## Services Activation

No services are enabled on the node by default. To enable services,
define them in the `services.toml` configuration file.
This file is required for a running node. `services.toml`
should be located in the **working directory** of your project,
where you run commands.
It consists of two sections:
`system_services` and `user_services`.

The `user_services` section enumerates services in the form of
`name = artifact`, where `name` is a one-word description of the service
and `artifact` is a full path to the service's artifact. It must be absolute
unless you want to depend on the application working directory.

!!! note
    At least one service must be defined
    in the `[user_services]` section.

```toml
[user_services]
service_name1 = "/path/to/service1_artifact.jar"
```

The optional `system_services` section is used to enable built-in Exonum services.

```toml
system_services = ["service-name"]
```

where possible values for `service-name` are:

- `configuration` for Configuration Update Service
- `btc-anchoring` for Anchoring Service
- `time` for Time Oracle

!!! note
    In case there is no such section,
    only Configuration Service will be activated.

Below is the sample of the `services.toml` file that enables
all possible built-in Exonum services and two user services:

```toml
system_services = ["configuration", "btc-anchoring", "time"]
[user_services]
service_name1 = "/path/to/service1_artifact.jar"
service_name2 = "/path/to/service2_artifact.jar"
```

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
specified by the `ejb-log-config-path` parameter. If no file was
provided, the logs are disabled. Exonum Java package provides an
example `log4j-fallback.xml` configuration file that can be found
at the installation directory. With this file `INFO`-level messages
are printed to stdout.
Also, see [Application Guide][app-tutorial] for more information on
configuring the Exonum Java App.

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
      <version>0.8.0</version>
    </dependency>
```

## Known Limitations

- Core collections necessary to form a complete cryptographic proof for user
  service data (collections and their elements) are available only in a "raw"
  form – without deserialization of the content, which makes their use somewhat
  difficult.
- Custom Rust services can be added to the application only by modifying and
  rebuilding thereof.
- Exonum Java application does not support Windows yet.

## See Also

- [Rust instruction](create-service.md)
- [Exonum Java App tutorial][app-tutorial]

[abstractservice]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/service/AbstractService.html
[app-tutorial]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.8.0/exonum-java-binding/core/rust/exonum-java/TUTORIAL.md
[blockchain]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/blockchain/Blockchain.html
[brew-install]: https://docs.brew.sh/Installation
[build-description]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.8.0/exonum-java-binding/service-archetype/src/main/resources/archetype-resources/pom.xml
[configurable]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/service/Configurable.html
[env_logger-docs]: https://docs.rs/env_logger/0.6.2/env_logger/#enabling-logging
[env_logger-home]: https://crates.io/crates/env_logger
[Exonum-services]: ../architecture/services.md
[github-releases]: https://github.com/exonum/exonum-java-binding/releases
[guice-home]: https://github.com/google/guice
[guice-wiki]: https://github.com/google/guice/wiki/GettingStarted
[homebrew]: https://github.com/Homebrew/brew#homebrew
[how-to-build]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.8.0/CONTRIBUTING.md#how-to-build
[libsodium]: https://download.libsodium.org/doc/
[log4j-docs]: https://logging.apache.org/log4j/2.x/manual/index.html
[log4j-home]: https://logging.apache.org/log4j
[nodefake]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/service/NodeFake.html
[schema]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/service/Schema.html
[service]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/service/Service.html
[service-after-commit]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/service/Service.html#afterCommit(com.exonum.binding.service.BlockCommittedEvent)
[service-before-commit]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/service/Service.html#beforeCommit(com.exonum.binding.core.storage.database.Fork)
[node-submit-transaction]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/service/Node.html#submitTransaction(com.exonum.binding.transaction.RawTransaction)
[slf4j-home]: https://www.slf4j.org/
[standardserializers]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/common/serialization/StandardSerializers.html
[standard-supervisor-rustdoc]: https://docs.rs/exonum-supervisor/0.13.0-rc.2/exonum_supervisor/
[storage-indices]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/storage/indices/package-summary.html
[time-oracle]: ../advanced/time.md
[transaction]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/transaction/Transaction.html
[transaction-execution-context]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/transaction/TransactionContext.html
[transactions]: ../architecture/transactions.md
[transactions-messages]: ../architecture/transactions.md#messages
[transactionconvererter]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/service/TransactionConverter.html
[vertx-web-docs]: https://vertx.io/docs/vertx-web/java/#_basic_vert_x_web_concepts
[maven-install]: https://maven.apache.org/install.html
[cryptofunctions-ed25519]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/common/crypto/CryptoFunctions.html#ed25519--
[service-create-public-api]: https://exonum.com/doc/api/java-binding/0.8.0/com/exonum/binding/core/service/Service.html#createPublicApiHandlers-com.exonum.binding.service.Node-io.vertx.ext.web.Router-
[transaction-result]: https://docs.rs/exonum/0.12/exonum/blockchain/struct.TransactionResult.html
[exonum-transaction-endpoint]: ../advanced/node-management.md#transaction
