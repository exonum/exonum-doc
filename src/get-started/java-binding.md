# Java Binding User Guide

**Exonum Java App** is an application that includes the Exonum framework
and Java services runtime environment.

## Installation

To run a node with your Java service you need to use Exonum Java application.

There are several installation options:

- [Manual installation](#manual-installation) - available for Mac OS and Linux
- [Homebrew package](#homebrew-package) - available for Mac OS only,
  recommended for Mac users
- [Build from source](#build-from-source) - available for Mac OS and Linux

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
  unzip /path/to/downloaded/exonum-java-0.6.0-release.zip
  ```

- Install [Libsodium][libsodium] as the necessary runtime dependency.
  For Mac OS also install RocksDB library:
  
??? example "Linux (Ubuntu)"
    ```bash
    sudo apt-get update && sudo apt-get install libsodium-dev
    ```
  
??? example "Mac OS"
    ```bash
    brew install libsodium rocksdb
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
  location. You should also add an entry to the `PATH` variable.

  ```bash
  export EXONUM_HOME=~/bin/exonum-java-0.6.0-release
  export PATH="$PATH:$EXONUM_HOME"
  ```

- Install [Maven 3][maven-install] which is essential for developing and building
  Java service.

- This step is not necessary during installation, but is required to configure
  the JVM to use by the application. Add a path to your JVM library to the
  `LD_LIBRARY_PATH` environment variable. You can use the following script:

  <!-- cspell:disable -->

  ```bash
  JAVA_HOME="${JAVA_HOME:-$(java -XshowSettings:properties -version \
    2>&1 > /dev/null |\
    grep 'java.home' |\
    awk '{print $3}')}"
  LIBJVM_PATH="$(find ${JAVA_HOME} -type f -name libjvm.* | xargs -n1 dirname)"

  export LD_LIBRARY_PATH="${LIBJVM_PATH}"
  ```

  <!-- cspell:enable -->

## Creating Project

The easiest way to create a Java service project is to use a template project
generator. After [installing Maven 3][maven-install], run the command:

``` none
mvn archetype:generate \
    -DinteractiveMode=false \
    -DarchetypeGroupId=com.exonum.binding \
    -DarchetypeArtifactId=exonum-java-binding-service-archetype \
    -DarchetypeVersion=0.6.0 \
    -DgroupId=com.example.myservice \
    -DartifactId=my-service \
    -Dversion=1.0.0
```

You can also use the interactive mode:

``` none
mvn archetype:generate \
    -DarchetypeGroupId=com.exonum.binding \
    -DarchetypeArtifactId=exonum-java-binding-service-archetype \
    -DarchetypeVersion=0.6.0
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
    void updateBalance(Fork fork) {
      var name = "balanceById";
      var balanceById = ProofMapIndexProxy.newInstance(name, fork,
          StandardSerializers.hash(),
          StandardSerializers.longs());
      balanceById.put(id, newBalance);
    }
    ```

A set of named collections constitute a *service scheme*. For convenient access
to service collections you can implement a factory of service collections.

*The state of the service in the blockchain* is determined by the list of
root hashes of its Merkelized collections. Said root hashes, when aggregated
with root hashes of other Merkelized collections in the blockchain, form a
single
blockchain state hash, which is included in each committed block. When using
`AbstractService`, the root hash list must be defined in the schema class that
implements [`Schema`][schema] interface; when implementing
`Service` directly – in the service itself.

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
A transaction message contains a header with the identifying information,
such as an ID of the service this transaction belongs to and a transaction ID
within that service; a payload containing transaction parameters;
a public key of the author and a signature that authenticates them.

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
4. The node verifies that the transaction payload can be correctly decoded
  by the service into an *executable transaction*.
5. If all checks pass, the node that received the message adds it to its
  local transaction pool and broadcasts the message to all the other nodes
  in the network.
6. Other nodes, having received the transaction message, perform all
  the previous verification steps, and, if they pass, add the message to
  the local transaction pool.
7. When majority of validator nodes agree to include this transaction
  into the next block, they take the message from the transaction pool and
  convert it into an executable transaction,
  and [execute](#transaction-execution) it.
8. When all transactions in the block are executed, all changes are atomically
  applied to the database state and a new block is committed.

The transaction messages are preserved in the database regardless of
the execution result, and can be later accessed via `Blockchain` class.
For a more detailed description of transaction processing,
see the [Transaction Lifecycle](../architecture/transactions.md#lifecycle)
section.

##### Transaction Execution

When the framework receives a transaction message, it must transform it into
an *executable transaction* to process. As every service has several transaction
types each with its own parameters, it must provide
a [`TransactionConverter`][transactionconvererter] for this purpose (see also
`Service#convertToTransaction`).
When the framework requests a service to convert a transaction,
its message is guaranteed to have a correct cryptographic signature.

An executable transaction is an instance of a class implementing
the [`Transaction`][transaction] interface and defining transaction
business logic. The interface implementations must define an execution
rule for the transaction in `execute` method.

The `Transaction#execute` method describes the operations that are applied to the
current storage state when the transaction is executed. Exonum passes
an [execution context][transaction-execution-context] as an argument,
which provides a `Fork` – a view that allows performing modifying
operations; and some information about the corresponding transaction message:
its SHA-256 hash that uniquely identifies it, and the author’s public key.
A service schema object can be used to access data collections of this service.

Also, `Transaction#execute` method may throw `TransactionExecutionException`
which contains a transaction error report. This feature allows users to notify
Exonum about an error in a transaction execution whenever one occurs.
It may check the preconditions before executing a transaction and either
accepts it or throws an exception that is further transformed into an Exonum
core [TransactionResult enum][transaction-result] containing an error code and
a message with error data.
If transaction execution fails, the changes made by the transaction are
rolled back, while the error data is stored in the database for further user
reference. Light clients also provide access to information on the
[transaction][exonum-transaction] execution result
(which may be either success or failure) to their users.

An implementation of the `Transaction#execute` method must be a pure function,
i.e. it must produce the same _observable_ result on all the nodes of the system
for the given transaction. An observable result is the one that affects the
blockchain state hash: a modification of a collection that affects the service
state hash, or an execution exception.

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
- `getTxResults: ProofMapIndexProxy<HashCode, TransactionResult>`
  The map of transaction execution results identified by the corresponding
  transaction SHA-256 hashes
- `getTxLocations: MapIndex<HashCode, TransactionLocation>`
  The map of transaction positions inside the blockchain identified by
  the corresponding transaction SHA-256 hashes
- `getBlocks: MapIndex<HashCode, Block>`
  The map of block objects identified by the corresponding block hashes
- `getLastBlock: Block`
  The latest committed block
- `getActualConfiguration: StoredConfiguration`
  The configuration for the latest height of the blockchain, including services
  and their parameters

### External Service API

The external service API is used for the interaction between a service
and external systems.
A set of operations defined by a service usually includes read requests
for the blockchain data with the provision of the corresponding cryptographic
proof. Exonum provides an embedded web framework for implementing
the REST-interface of the service.

[`Service#createPublicApiHandlers`][createpublicapi] method is used to
set the handlers for HTTP requests. These handlers are available at the
common path corresponding to the service name. Thus, the `/balance/:walletId`
handler for balance requests in the "cryptocurrency" service will be available
at `/api/cryptocurrency/balance/:walletId`.

See [documentation][vertx-web-docs] on the possibilities of `Vert.x` used as a web
framework.

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

[abstract-service-module-javadoc]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/service/AbstractServiceModule.html

## Testing

You can test Exonum services with the help of the [`exonum-testkit`][testkit-maven]
library. TestKit allows to test transaction execution in the synchronous environment
by offering simple network emulation (that is, without consensus algorithm and
network operation involved).

For using the library include the dependency in your `pom.xml`:

``` xml
    <dependency>
      <groupId>com.exonum.binding</groupId>
      <artifactId>exonum-testkit</artifactId>
      <version>0.7.0</version>
      <scope>test</scope>
    </dependency>
```

`exonum-testkit` will be already included in projects generated with [`exonum-java-binding-service-archetype`][archetype-maven].

The plug-in for running tests should be configured to pass
`java.library.path` system property to JVM:

``` none
-Djava.library.path=$EXONUM_JAVA/lib/native
```

`$EXONUM_JAVA` environment variable should point at installation location,
as specified in [How to Run a Service section](#how-to-run-a-service).

`Surefire/Failsafe` for Maven should be configured as follows:

```xml
<plugin>
    <!-- You can also configure a failsafe to run integration tests during
         'validate' phase of a Maven build to separate unit tests and ITs. -->
    <artifactId>maven-surefire-plugin</artifactId>
    <configuration>
        <argLine>
            -Djava.library.path=${path-to-java-bindings-library}
        </argLine>
    </configuration>
</plugin>
```

### Creating Test Network

To perform testing, we first need to create a network emulation – the instance of
[`TestKit`][testkit]. TestKit allows recreating behavior of a
single full node (a validator or an auditor) in an emulated Exonum blockchain network.

To instantiate a `TestKit` use [`TestKit.Builder`][testkit-builder]. It allows configuration of:

- Type of emulated node (either [Validator][validator] or [Auditor][auditor])
- Services with which the TestKit would be instantiated
- [`TimeProvider`][testkit-time-provider] if usage of [Time Oracle](../advanced/time.md) is needed (see [Time Oracle Testing](#time-oracle-testing))
- Number of validators in emulated network

!!! note
    Note that regardless of the configured number of validators, only a single node will
    be emulated. This node will create the service instances, execute their operations
    (e.g., [`afterCommit(BlockCommittedEvent)`][service-after-commit] method logic),
    and provide access to its state.

Default TestKit can be instantiated with a single validator as an emulated node,
single service and without Time Oracle in the following way:

```java
try (TestKit testKit = TestKit.forService(MyServiceModule.class)) {
  // Test logic
}
```

Or using a builder if different configuration is needed:

```java
try (TestKit testKit = TestKit.builder()
    .withServices(MyServiceModule.class, MyServiceModule2.class)
    .withValidators(2)
    .build()) {
  // Test logic
}
```

### Transactions testing

TestKit allows testing transaction execution by submitting blocks with given
[transaction messages][transactions-messages]:

```java
try (TestKit testKit = TestKit.forService(MyServiceModule.class)) {
  // Construct some transaction to be executed
  TransactionMessage message = constructTransactionMessage();
  // Commit block with this transaction
  Block block = testKit.createBlockWithTransactions(message);
  // Check the resulting block or blockchain state
}
```

TestKit also allows creating blocks that contain [in-pool][in-pool] transactions:

```java
try (TestKit testKit = TestKit.forService(MyServiceModule.class)) {
  // Put the transaction into TestKit transaction pool
  MyService service = testKit.getService(MyService.SERVICE_ID, MyService.class);

  TransactionMessage message = constructTransactionMessage();
  RawTransaction rawTransaction = RawTransaction.fromMessage(message);
  service.getNode().submitTransaction(rawTransaction);
  Block block = testKit.createBlock();
  // Check the resulting block or blockchain state
}
```

Transactions that were submitted in `afterCommit` method will also be put into this pool.

!!! note
    Note that blocks that are created with
    [`TestKit.createBlockWithTransactions(Iterable<TransactionMessage> transactionMessages)`][testkit-create-block]
    will ignore in-pool transactions. As of 0.7.0, there is no way to create a block
    that would contain both given and in-pool transactions - to do that, put given
    transactions into TestKit transaction pool with [`Node.submitTransaction(RawTransaction rawTransaction)`][node-submit-transaction].

#### Checking the blockchain state

In order to check blockchain state TestKit provides a snapshot of the current
database state (i.e., the one that corresponds to the latest committed block).
There are several ways to access it:

- `void withSnapshot(Consumer<Snapshot> snapshotFunction)`
  Performs a given function with a snapshot of the current database state
- `<ResultT> ResultT applySnapshot(Function<Snapshot, ResultT> snapshotFunction)`
  Performs a given function with a snapshot of the current database state and returns a result of its execution
- `Snapshot getSnapshot()`
  Returns a snapshot of the current database state

!!! note
    Note that `withSnapshot` and `applySnapshot` methods destroy the snapshot once
    the passed closure completes, compared to `getSnapshot`, which disposes created
    snapshots only when TestKit is closed.
    Therefore it is recommended to use first two methods if a large number
    (e.g. more than a hundred) of snapshots needs to be created.

See below an example of a complete TestKit test:

??? note "Complete test example"
    ```java
    package com.exonum.binding.example;

    import static org.assertj.core.api.Assertions.assertThat;

    import com.exonum.binding.core.blockchain.Blockchain;
    import com.exonum.binding.core.service.Service;
    import com.exonum.binding.testkit.TestKit;
    import org.junit.jupiter.api.Test;

    class MyServiceTest {

      @Test
      void testTransactionExecution() {
        // Create a TestKit for given service
        try (TestKit testKit = TestKit.forService(MyServiceModule.class)) {
          // Retrieve the instance of created service
          MyService service = testKit.getService(MyService.ID, MyService.class);

          // Construct some transaction to be executed
          TransactionMessage message = constructTransactionMessage();
          Block block = testKit.createBlockWithTransactions(message);

          // Check that transaction was executed successfully
          Snapshot view = testKit.getSnapshot();
          Blockchain blockchain = Blockchain.newInstance(view);
          Map<HashCode, TransactionResult> transactionResults = toMap(blockchain.getTxResults());
          assertThat(transactionResults).hasSize(1);
          TransactionResult transactionResult = transactionResults.get(message.hash());
          assertThat(transactionResult).isEqualTo(TransactionResult.successful());
        }
      }
    ```

### Time Oracle Testing

The testkit allows to use [Time Oracle](../advanced/time.md) in your tests. To do that, TestKit should be provided with [`TimeProvider`][testkit-time-provider].

```java
ZonedDateTime initialTime = ZonedDateTime.of(2000, 1, 1, 1, 1, 1, 1, ZoneOffset.UTC);
TimeProvider timeProvider = FakeTimeProvider.create(initialTime);
try (TestKit testKit = TestKit.builder()
      .withService(MyServiceModule.class)
      .withTimeService(timeProvider)
      .build()) {
  // Test logic
}
```

### TestKit JUnit extension

TestKit JUnit extension simplifies writing tests that use TestKit. It allows defining a TestKit builder that would be used to inject TestKit objects into test cases as a parameter and delete them afterwards.
To enable it, define a [`TestKitExtension`][testkit-extension] object, annotated with [`@RegisterExtension`][junit-register-extension]:

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

It is possible to configure injected TestKit instance with following annotations:

- [`@Validator`][testkit-extension-validator] sets emulated TestKit node type to validator
- [`@Auditor`][testkit-extension-auditor] sets emulated TestKit node type to auditor
- [`@ValidatorCount`][testkit-extension-validatorcount] sets number of validator nodes in the TestKit network

These annotations should be applied on TestKit parameter:

```java
@RegisterExtension
TestKitExtension testKitExtension = new TestKitExtension(
  TestKit.builder()
    .withService(MyServiceModule.class));

@Test
 void validatorTest(TestKit testKit) {
   // Injected TestKit has default configuration, specified in builder above
 }

 @Test
 void auditorTest(@Auditor @ValidatorCount(8) TestKit testKit) {
   // Injected TestKit has altered configuration - auditor as emulated node and 8 validator nodes
 }
```

!!! note
    Note that after TestKit is instantiated in given test context, it is not possible to reconfigure it again. For example, if TestKit is injected in [`@BeforeEach`][junit-beforeeach] method,
    it can't be reconfigured in [`@Test`][junit-test] or [`@AfterEach`][junit-aftereach] methods.
    Also note that TestKit can't be injected in [`@BeforeAll`][junit-beforeall] and [`@AfterAll`][junit-afterall] methods.

### API

To test API implemented with Vertx tools, use the tools described in the
[project documentation](https://vertx.io/docs/vertx-unit/java/#_introduction).
You can use [Vertx Web Client][vertx-web-client] as a client or another HTTP
client.

An example of API service tests can be found in
[`ApiControllerTest`][apicontrollertest].

TODO: check links

[apicontrollertest]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.7.0/exonum-java-binding/cryptocurrency-demo/src/test/java/com/exonum/binding/cryptocurrency/ApiControllerTest.java
[archetype-maven]: https://mvnrepository.com/artifact/com.exonum.binding/exonum-java-binding-service-archetype/0.7.0
[auditor]: ../glossary.md#auditor
[in-pool]: https://exonum.com/doc/version/0.11/advanced/consensus/specification/#pool-of-unconfirmed-transactions
[junit-afterall]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/AfterAll.html
[junit-aftereach]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/AfterEach.html
[junit-beforeall]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/BeforeAll.html
[junit-beforeeach]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/BeforeEach.html
[junit-register-extension]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/extension/RegisterExtension.html
[junit-test]: https://junit.org/junit5/docs/5.5.0/api/org/junit/jupiter/api/Test.html
[node-submit-transaction]: https://exonum.com/doc/api/java-binding-core/0.7.0/com/exonum/binding/service/Node.html#submitTransaction(com.exonum.binding.transaction.RawTransaction)
[testkit]: https://exonum.com/doc/api/exonum-testkit/0.7.0/com/exonum/binding/testkit/TestKit.html
[testkit-builder]: https://exonum.com/doc/api/exonum-testkit/0.7.0/com/exonum/binding/testkit/TestKit.Builder.html
[testkit-create-block]: https://exonum.com/doc/api/exonum-testkit/0.7.0/com/exonum/binding/testkit/TestKit.html#createBlockWithTransactions(java.lang.Iterable)
[testkit-extension]: https://exonum.com/doc/api/exonum-testkit/0.7.0/com/exonum/binding/testkit/TestKitExtension.html
[testkit-extension-auditor]: https://exonum.com/doc/api/exonum-testkit/0.7.0/com/exonum/binding/testkit/Auditor.html
[testkit-extension-validator]: https://exonum.com/doc/api/exonum-testkit/0.7.0/com/exonum/binding/testkit/Validator.html
[testkit-extension-validatorcount]: https://exonum.com/doc/api/exonum-testkit/0.7.0/com/exonum/binding/testkit/ValidatorCount.html
[testkit-maven]: https://mvnrepository.com/artifact/com.exonum.binding/exonum-testkit/0.7.0
[testkit-time-provider]: https://exonum.com/doc/api/exonum-testkit/0.7.0/com/exonum/binding/testkit/TimeProvider.html
[validator]: ../glossary.md#validator
[vertx-web-client]: https://vertx.io/docs/vertx-web-client/java

## Using Libraries

An Exonum service can use any third-party library as its dependency.
At the same time, Exonum comes with its own dependencies.
Classes of these dependencies are used in Exonum public APIs:

- Exonum (exonum-java-binding-core, exonum-java-binding-common, exonum-time-oracle, exonum-testkit)
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
[bom]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.6.0/exonum-java-binding/bom/pom.xml
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

- [**Time Oracle.**](../advanced/time.md)
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

## Common Library

Java Binding includes a library module that can be useful for Java client
applications that interact with an Exonum service. The module does not
have the dependency on Java Binding Core, but it contains Java classes
obligatory for the core that can now as well be easily used in clients,
if necessary.
The library provides the ability to create transaction messages, check proofs,
serialize/deserialize data and perform cryptographic operations.
For using the library just include the dependency in your `pom.xml`:

``` xml
    <dependency>
      <groupId>com.exonum.binding</groupId>
      <artifactId>exonum-java-binding-common</artifactId>
      <version>0.6.0</version>
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

[abstractservice]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/service/AbstractService.html
[app-tutorial]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.6.0/exonum-java-binding/core/rust/exonum-java/TUTORIAL.md
[blockchain]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/blockchain/Blockchain.html
[brew-install]: https://docs.brew.sh/Installation
[build-description]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.6.0/exonum-java-binding/service-archetype/src/main/resources/archetype-resources/pom.xml
[Exonum-services]: ../architecture/services.md
[github-releases]: https://github.com/exonum/exonum-java-binding/releases
[guice-home]: https://github.com/google/guice
[guice-wiki]: https://github.com/google/guice/wiki/GettingStarted
[homebrew]: https://github.com/Homebrew/brew#homebrew
[how-to-build]: https://github.com/exonum/exonum-java-binding/blob/ejb/v0.6.0/CONTRIBUTING.md#how-to-build
[libsodium]: https://download.libsodium.org/doc/
[Memorydb]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/storage/database/MemoryDb.html
[nodefake]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/service/NodeFake.html
[schema]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/service/Schema.html
[service]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/service/Service.html
[service-after-commit]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/service/Service.html#afterCommit(com.exonum.binding.service.BlockCommittedEvent)
[node-submit-transaction]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/service/Node.html#submitTransaction(com.exonum.binding.transaction.RawTransaction)
[standardserializers]: https://exonum.com/doc/api/java-binding-common/0.6.0/com/exonum/binding/common/serialization/StandardSerializers.html
[storage-indices]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/storage/indices/package-summary.html
[transaction]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/transaction/Transaction.html
[transaction-execution-context]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/transaction/TransactionContext.html
[transactions]: ../architecture/transactions.md
[transactions-messages]: ../architecture/transactions.md#messages
[transactionconvererter]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/service/TransactionConverter.html
[vertx-web-docs]: https://vertx.io/docs/vertx-web/java/#_basic_vert_x_web_concepts
[maven-install]: https://maven.apache.org/install.html
[cryptofunctions-ed25519]: https://exonum.com/doc/api/java-binding-common/0.6.0/com/exonum/binding/common/crypto/CryptoFunctions.html#ed25519--
[createpublicapi]: https://exonum.com/doc/api/java-binding-core/0.6.0/com/exonum/binding/service/Service.html#createPublicApiHandlers-com.exonum.binding.service.Node-io.vertx.ext.web.Router-
[transaction-result]: https://docs.rs/exonum/0.11/exonum/blockchain/struct.TransactionResult.html
[exonum-transaction]: ../advanced/node-management.md#transaction
