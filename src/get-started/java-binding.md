# Java Binding User Guide

**Java Binding App** is an application that includes the Exonum framework
and Java services runtime environment.

## Creating Project

The easiest way to create a Java service project is to use a template project
generator. After [installing Maven 3][maven-install], run the command:

``` none
$ mvn archetype:generate \
    -DinteractiveMode=false \
    -DarchetypeGroupId=com.exonum.binding \
    -DarchetypeArtifactId=exonum-java-binding-service-archetype \
    -DarchetypeVersion=0.3 \
    -DgroupId=com.example.myservice \
    -DartifactId=my-service \
    -Dversion=1.0
```

You can also use the interactive mode:

``` none
$ mvn archetype:generate \
    -DarchetypeGroupId=com.exonum.binding \
    -DarchetypeArtifactId=exonum-java-binding-service-archetype
```

The build definition files for other build systems (e.g., [Gradle](https://gradle.org/))
can be created similarly to the
template. For more information see an [example][build-description].

## Service Development

The service abstraction serves to extend the framework and implement the
business logic of an application. The service defines the schema of the stored
data that constitute the service state; transaction processing rules that can
make changes to the stored data; and an API for external clients
that allows interacting
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
at the [`StandardSerializers`][standardserializers] utility class.
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

Transactions are transmitted by the service client as an Exonum message. The
transaction payload in the message can be serialized using an arbitrary
algorithm supported by both the service client and the service itself.

!!! note
    In the current framework version each service must implement a method for
    sending transactions of this service to the network. It is planned that this
    mechanism will be standardized and moved to the core.
    An example of a pseudo-code transaction handler is shown below. For an
    implementation example, see
    [`ApiController#submitTransaction`][submittransaction] in the cryptocurrency
    demo.

!!! note "Example of a Transaction Handler in Pseudo-code"
    ```none
    def handle_tx(request):
      var body = request.getBody()
      try:
        var message = txMessageFromBody(body)
        var tx = service.convertTransaction(txMessage)
        var hash = tx.hash()
        node.submitTransaction(tx)
        return ok(createTxResponse(hash))
      catch IllegalArgumentException as e:
        return badRequest("Invalid request: " + e)
      catch VerificationError as e:
        return badRequest("Invalid transaction: " + e)
      catch Error as e:
        log("Internal error:" + e)
        return internalServerError()
    ```

#### Executable Transactions

To correctly process a transaction, it must be transformed into an
*executable transaction* (see
[`TransactionConverter`][transactionconvererter] or
`Service#convertToTransaction` method) and transmitted to the framework using
`Node#submitTransaction` method. The framework verifies it, and if the
transactions is correct,
broadcasts it to other nodes of the system. Other nodes, having received the
transaction message, convert it into an executable transaction, also using the
service transaction converter.

An executable transaction is an instance of a class implementing
[`Transaction`][transaction] interface and defining transaction
business logic. The interface implementations must define the
transaction authentication rule (usually, the digital signature verification of
the message) – `isValid` method; and the execution rule for the
transaction – `execute` method.

Ed25519 is a standard cryptographic system for digital signature of Exonum
messages. It is available through
[`CryptoFunctions#ed25519`][cryptofunctions-ed25519] method.

The implementation of `Transaction#isValid` transaction authentication method
must be a pure function, i.e. for the given transaction to return the same
result on all nodes of the system. For this reason, access to the Exonum
storage, files or network resources is not allowed within the method
implementations.

`Transaction#execute` method describes the operations that are applied to the
current storage state when the transaction is executed. Exonum passes `Fork`
as an argument – a view that allows performing modifying operations. A service
schema object can be used to access data collections of this service.

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

### External Service API

The external service API is used for the interaction between the service and the
external systems.
A set of operations is defined by each service and can include sending
transactions to the network, read requests for blockchain data with the
provision of corresponding cryptographic proof, etc. Exonum provides an embedded
web framework for implementing the REST-interface of the service.

[`Service#createPublicApiHandlers`][createpublicapi] method is used to
set the handlers for HTTP requests. These handlers are available at the
common path corresponding to the service name. Thus, the `/balance/:walletId`
handler for balance requests in the "cryptocurrency" service will be available
at `/cryptocurrency/balance/:walletId`.

See [documentation][vertx.io] on the possibilities of `Vert.x` used as a web
framework.

### Dependencies Management

Exonum uses [Guice](https://github.com/google/guice) to describe the
dependencies of the service components (both system-specific
ones, for example, Exonum time service, and external ones). Each
service should define a module describing implementations of the framework
interfaces – `Service`, `TransactionConverter` and implementations of other
components, if any.

!!! note "Minimalistic Example of Service Module"
    ```java
    public class ServiceModule extends AbstractModule {

      @Override
      protected void configure() {
        // Define the Service implementation.
        bind(Service.class).to(CryptocurrencyService.class).in(Singleton.class);

        // Define the TransactionConverter implementation.
        bind(TransactionConverter.class).to(CryptocurrencyTransactionConverter.class);
      }
    }
    ```

The fully-qualified name (FQN) of the module class must be specified/passed
during configuration of an Exonum App that will run the service.

For more information on using Guice, see the [project wiki][Guice].

## Testing

### Schema and Operations with Storage

To test the schema and operations with the storage, Exonum provides a
database that stores the values in the RAM — [`MemoryDb`][Memorydb].
Before using it in integration tests, it is necessary to load
a library with the implementation of native methods:

```java
public class MySchemaIntegrationTest {
  static {
    LibraryLoader.load();
  }

  // Tests.
}
```

The plug-in for running tests should be configured to pass
`java.library.path` system property to JVM:

``` none
-Djava.library.path=<path-to-java-bindings-library>
```

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

Each test can create `Snapshot` and/or `Fork`, using `MemoryDb`, and also apply
changes made to `Fork` to the database state:

??? note "MySchemaTest"
    ```java
    package com.exonum.binding.qaservice;

    import com.exonum.binding.proxy.Cleaner;
    import com.exonum.binding.storage.database.Fork;
    import com.exonum.binding.storage.database.MemoryDb;
    import com.exonum.binding.storage.database.Snapshot;
    import org.junit.After;
    import org.junit.Before;
    import org.junit.Test;

    public class MySchemaTest {

      MemoryDb db;
      Cleaner cleaner;

      @Before
      public void setUp() {
        db = MemoryDb.newInstance();
        cleaner = new Cleaner();
      }

      @After
      public void tearDown() throws Exception {
        cleaner.close();
        db.close();
      }

      @Test
      public void testCreatingSnapshot() {
        Snapshot snapshot = db.createSnapshot(cleaner);
        // Use the Snapshot to test the schema.
      }

      @Test
      public void testMergingSomeChanges() {
        Fork fork = db.createFork(cleaner);
        // Make some changes to Fork.
        // …

        // Merge the changes made to the database Fork into the database.
        db.merge(fork);

        // Create a Snapshot of the database state. Must include the changes
        // made above.
        Snapshot snapshot = db.createSnapshot(cleaner);
        // Use the Snapshot to test the schema/transaction
        // with a certain database state.
        // …
      }
    }
    ```

!!! warning
    Java integration tests that use the shared native library currently work
    on MacOS only. However, the Java Binding App, which runs Java services,
    works fine on both MacOS and Linux.

### Transactions

To test transactions execution, you can use `MemoryDb`, as in the previous
section.

### Read Requests

To test read requests for service data, you can use a fake that implements
`Node` interface and uses `MemoryDb` to create `Snapshot`:
[`NodeFake`][nodefake].
The `MemoryDb` contents can be filled in by executing `MemoryDb#merge(Fork)`
operation as in the section above.

### API

To test API implemented with Vertx tools, use the tools described in the
[project documentation](https://vertx.io/docs/vertx-unit/java/#_introduction).
You can use [Vertx Web Client][vertx-web-client] as a client or another HTTP
client.

An example of API service tests can be found in
[`ApiControllerTest`][apicontrollertest].

## How to Run a Service

Currently you have to build a native application to run a node with your Java
service:

- Install the system dependencies and [build][how-to-build] the application.
- Follow the instructions in the [application guide][app-tutorial] to configure
  and start an Exonum node with your service.

## Common Library

Java Binding includes a library module that can be useful for Java client
applications that interact with an Exonum service and
does not have the dependency on Java Binding Core. The module contains Java
classes obligatory for core that can now as well be easily applied in clients,
if necessary.
The library provides the ability to create transaction messages, check proofs,
serialize/deserialize data and perform cryptographic operations.
For using the library just include the dependency in your `pom.xml`:

``` xml
    <dependency>
      <groupId>com.exonum.binding</groupId>
      <artifactId>exonum-java-binding-common</artifactId>
      <version>0.3</version>
    </dependency>
```

## Known Limitations

- Serialization is determined by a user, so Java services are not compatible
  with JS light client.
- Core collections necessary to form a complete cryptographic proof for user
  service data (collections and their elements) are available only in a "raw"
  form – without deserialization of the content, which makes their use somewhat
  difficult.
- [Time oracle](../advanced/time.md) service is not available,
  but will be integrated into EJB App soon.
- Custom Rust services can be added to the application only by modifying and
  rebuilding thereof.
- The application supports only one Java service. Support of multiple Java
  services is coming in the near future.

## See Also

- [Rust instruction](create-service.md)
- [Java Binding App tutorial][app-tutorial]

[abstractservice]: https://exonum.com/doc/api/java-binding-core/latest/com/exonum/binding/service/AbstractService.html
[apicontrollertest]: https://github.com/exonum/exonum-java-binding/blob/v0.3/exonum-java-binding-cryptocurrency-demo/src/test/java/com/exonum/binding/cryptocurrency/ApiControllerTest.java
[app-tutorial]: https://github.com/exonum/exonum-java-binding/blob/master/exonum-java-binding-core/rust/ejb-app/TUTORIAL.md
[build-description]: https://github.com/exonum/exonum-java-binding/blob/master/exonum-java-binding-service-archetype/src/main/resources/archetype-resources/pom.xml
[Exonum-services]: ../architecture/services.md
[Guice]: https://github.com/google/guice/wiki/GettingStarted
[how-to-build]: https://github.com/exonum/exonum-java-binding/blob/master/CONTRIBUTING.md#how-to-build
[Memorydb]: https://exonum.com/doc/api/java-binding-core/latest/com/exonum/binding/storage/database/MemoryDb.html
[nodefake]: https://exonum.com/doc/api/java-binding-core/latest/com/exonum/binding/service/NodeFake.html
[schema]: https://exonum.com/doc/api/java-binding-core/latest/com/exonum/binding/service/Schema.html
[service]: https://exonum.com/doc/api/java-binding-core/latest/com/exonum/binding/service/Service.html
[standardserializers]: https://exonum.com/doc/api/java-binding-common/latest/com/exonum/binding/common/serialization/StandardSerializers.html
[storage-indices]: https://exonum.com/doc/api/java-binding-core/latest/com/exonum/binding/storage/indices/package-summary.html
[submittransaction]: https://github.com/exonum/exonum-java-binding/blob/v0.3/exonum-java-binding-cryptocurrency-demo/src/main/java/com/exonum/binding/cryptocurrency/ApiController.java
[transaction]: https://exonum.com/doc/api/java-binding-core/latest/com/exonum/binding/transaction/Transaction.html
[transactions]: ../architecture/transactions.md
[transactionconvererter]: https://exonum.com/doc/api/java-binding-core/latest/com/exonum/binding/service/TransactionConverter.html
[vertx.io]: https://vertx.io/docs/vertx-web/java/#_basic_vert_x_web_concepts
[vertx-web-client]: https://vertx.io/docs/vertx-web-client/java
[maven-install]: https://maven.apache.org/install.html
[cryptofunctions-ed25519]: https://exonum.com/doc/api/java-binding-common/latest/com/exonum/binding/common/crypto/CryptoFunctions.html#ed25519--
[createpublicapi]: https://exonum.com/doc/api/java-binding-core/latest/com/exonum/binding/service/Service.html#createPublicApiHandlers-com.exonum.binding.service.Node-io.vertx.ext.web.Router-
[transaction-result]: https://docs.rs/exonum/latest/exonum/blockchain/type.TransactionResult.html
[exonum-transaction]: https://exonum.com/doc/advanced/node-management/#transaction
