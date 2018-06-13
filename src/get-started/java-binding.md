---
title: Exonum Java Binding User Guide
---
# Exonum Java Binding User Guide

Exonum Java Binding App is an application that includes the Exonum framework,
system services and Java services runtime environment.

## Installing Exonum Java Binding App

Download the archive with the [latest version of the application](https://github.com/exonum/exonum-java-binding/releases).

**TBD:**  The following installation steps will be provided soon.

## Java Services Development

### Creating Project

The easiest way to create a Java service project is to use the generic template
generator. After installing Maven 3, run the command:

``` none
$ mvn archetype:generate \
          -DinteractiveMode=false \
          -DarchetypeGroupId=com.exonum.binding \
          -DarchetypeArtifactId=exonum-java-binding-service-archetype \
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

The assembly description files for other systems can be created similarly to the
template. For more information see an [example][assembly-description].

#### System Dependencies

System dependencies, such as `exonum-java-binding-core` and
`exonum-java-binding-proofs`, are shipped together with the Exonum App, so when
defining them in [pom.xml][pom.xml] you should use scope [`provided`](https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html#Dependency_Scope).

### Service Development

The service abstraction serves to expand the framework and implement the
business logic of the application. The service defines the schema of the stored
data that constitute the service state; transaction processing rules that can
make changes to the stored data; and the external API that allows to interact
with the service from outside of the system. See more information on the
software model of the service in the [corresponding section][Exonum-services].

In Java, the abstraction of the service is represented by
`com.exonum.binding.service.Service` interface. Implementations can use the
abstract class `com.exonum.binding.service.AbstractService`.

### Service Schema Description

Exonum provides a lot of stored named collections for the service data. The main
collection types are sets, lists and maps. Data organization inside the
collections is arranged in two ways - ordinary collections and [Merkelized
collections](https://en.wikipedia.org/wiki/Merkle_tree); the latter allow to
provide cryptographic evidence of the authenticity of the data to the clients of
the system (for example, that an element is stored in the collection under a
certain key). The [blockchain state](../glossary.md#blockchain-state) is
influenced only by the Merkelized collections.

For the detailed description of all Exonum collection types see the relevant
[documentation](../architecture/storage/#table-types). In Java,
implementations of the collections are located in
`com.exonum.binding.storage.indices` package. This package documentation
describes the peculiarities of their use.

!!! note
    `SparseListIndex` is not yet supported in Java. Let us know if it may be
    useful for you!

Collections work with a database view - either `Snapshot`, which is read-only;
or `Fork`, which is mutable and allows performing modifying operations. The
database representation is provided by the framework: `Snapshot` can be
requested at any time, while `Fork` - only when the transaction is executed. The
lifetime of these objects is limited by the scope of the method to which they
are transferred.

Exonum stores arrays of bytes in the storage collections. Therefore, the user
must implement serialization of values ​​stored in the collection. Java Binding
provides *serializers* for standard and some commonly used types, see
`com.exonum.binding.storage.serialization.StandardSerializers`.

!!! note "Example of ProofMapIndex Creation"
    ```java
    void updateBalance(Fork fork) {
      var name = "balanceById";
      var balanceById = ProofMapIndexProxy.newInstance(name, fork, StandardSerializers.hash(),
          StandardSerializers.longs());
      balanceById.put(id, newBalance);  
    }
    ```

A set of named collections constitute a *service scheme*. For convenient access
to service collections you can implement a factory of service collections.

*The state of the service in the blockchain* is determined by the list of the
root hashes of its Merkelized collections. When using `AbstractService`, the
root hash list must be defined in the schema class that implements
`com.exonum.binding.service.Schema` interface; when implementing `Service`
directly - in the service itself.

### Service Transactions Description

Exonum transactions allow you to perform modifying atomic operations with the
storage. Transactions are executed sequentially, in the order determined by the
consensus of the nodes in the network.

#### Messages

Transactions are transmitted by the service client as an Exonum message. The
transaction data in the message can be serialized using an arbitrary algorithm
supported by both the service client and the service itself.

!!! note
    In the current framework version each service must implement a method for
    sending transactions of this service to the network. It is planned that this
    mechanism will be standardized and moved to the core.
    An example of a pseudo-code transaction handler is shown below. For an
    implementation example, see
    `com.exonum.binding.cryptocurrency.ApiController#submitTransaction`.

!!! note "Example of a Pseudo-code Transaction Handler"
    ```
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
*executable transaction* (see `TransactionConverter` or
`Service#convertTransaction` method) and transmitted to the framework using
`Node#submitTransaction` method. The framework checks it, and if it is correct,
broadcasts it to other nodes of the system. Other nodes, having received the
transaction message, convert it into an executable transaction, also using the
service transaction converter.

An executable transaction is a class object that implements
`com.exonum.binding.messages.Transaction` interface and defines transaction
behavior and business logic. The interface implementations must define the
transaction authentication rule (usually, the digital signature verification of
the message) - `isValid` method; and the execution rule for the
transaction - `execute` method.

Ed25519 is a standard cryptographic system for digital signature of Exonum
messages. We use `com.exonum.binding.crypto.CryptoFunctions#ed25519`
method for obtaining the implementation of the function.

The implementation of `Transaction#isValid` transaction authentication method
must be a pure function, i.e. for the given transaction to return the same
result on all nodes of the system. For this reason, access to the Exonum
storage by external files or network resources in method implementations is
not allowed.

`Transaction#execute` method describes the operations that are applied to the
current storage state when the transaction is executed. Exonum transfers `Fork`
as an argument - a view that allows performing modifying operations. A service
schema object can be used to access data collections of this service.

!!! note
    `Transaction#info` will be deleted soon.

For more details about transactions in Exonum - their properties and processing
rules - see our [documentation][transactions]

### Description of the External Service API

The external service API serves for interaction of the service and the external
systems. A set of operations is defined by each service and can include sending
transactions to the network, read requests for the blockchain data with the
provision of the cryptographic proof, etc. Exonum provides an embedded web
framework for describing the REST-interface of the service.

`com.exonum.binding.service.Service#createPublicApiHandlers` method is used to
determine the handlers for HTTP requests. These handlers are available at the
common path corresponding to the service name. Thus, the `/balance/:walletId`
handler for balance requests in the "cryptocurrency" service will be available
at `/cryptocurrency/balance/:walletId`.

See [documentation][vertx.io] on the possibilities of `Vert.x` used as a web
framework.

### Dependencies Management

To describe the dependencies of the service components (both system-specific
ones, for example, Exonum time service, and external ones), Guice is used. Each
service should define a module describing implementations of the framework
interfaces - `com.exonum.binding.service.Service`,
`com.exonum.binding.service.TransactionConverter` and other components
implementations, if any.

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

The full name of the module class must be submitted when the service launches.

For more information on using Guice, see the [project wiki][Guice].

### Testing

#### Of Schema and Manipulations with the Storage

To test the schema and manipulations with the storage, Exonum provides a
database that stores the values in the RAM -
`com.exonum.binding.storage.database.MemoryDb`. Before using it in integration
tests, it is necessary to load a library with the implementation of native
methods:

```java
public class MySchemaIntegrationTest {
  static {
    LibraryLoader.load();
  }

  // Tests
}
```

The plug-in for running the tests should be configured to transmit
`java.library.path` parameter to JVM:

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

Each test can create `Snapshot`, `Fork`, using `MemoryDb`, and also apply `Fork`
to its state:

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
        // Use the Snapshot to test the schema
      }

      @Test
      public void testMergingSomeChanges() {
        Fork fork = db.createFork(cleaner);
        // Make some changes to Fork
        // …

        // Merge the changes made to the database Fork into the database
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

##### Of Transactions

To test transactions execution, you can use `MemoryDb`, as in the previous
section.

#### Of Read Requests

To test read requests for service data, you can use a fake that implements
`Node` interface and uses `MemoryDb` to create `Snapshot`:
`com.exonum.binding.service.NodeFake`. The `MemoryDb` contents can be filled in
by executing `MemoryDb#merge(Fork)` operation as in the section above.

#### Of API

To test API implemented by Vertx tools, use the tools described in the
[project documentation](https://vertx.io/docs/vertx-unit/java/#_introduction)

You can use [Vertx Web Client][vertx-web-client] as a client or another HTTP
client.

An example of API service tests can be found in
`com.exonum.binding.cryptocurrency.ApiControllerTest`.

### Known Limitations

- Serialization is determined by a user, so Java services are not compatible
  with JS light client (unless messages are updated).
- Core collections necessary to form a complete cryptographic proof for user
  service data (collections and their elements) are available only in a "raw"
  form - without deserialization of the content, which makes their use somewhat
  difficult.
- Not all system Rust services are available (EJB App configuration, Exonum
  time and anchoring services will be integrated).
- Custom Rust services can be added to the application only by modifying and
  rebuilding thereof.
- The application supports only one Java service. However, there will be more!

### See Also

- [Rust instruction](https://exonum.com/doc/get-started/create-service/)

[assembly-description]: https://github.com/exonum/exonum-java-binding/blob/master/exonum-java-binding-service-archetype/src/main/resources/archetype-resources/pom.xml
[Exonum-services]: https://exonum.com/doc/architecture/services/
[Guice]: https://github.com/google/guice/wiki/GettingStarted
[pom.xml]: https://github.com/exonum/exonum-java-binding/blob/master/exonum-java-binding-service-archetype/src/main/resources/archetype-resources/pom.xml
[transactions]: https://exonum.com/doc/architecture/transactions/
[vertx.io]: https://vertx.io/docs/vertx-web/java/#_basic_vert_x_web_concepts
[vertx-web-client]: https://vertx.io/docs/vertx-web-client/java
