# First Exonum Java Service Tutorial

This tutorial is aimed at beginners in Exonum Java. It is an introduction
into service development in Java. As such, it does not cover some important
to real-world services topics, like authorization, or proofs of authenticity
for service data, or testing, but gives a foundation to learn about that
in subsequent materials.

<!-- todo: What is our introductory page on main Exonum principles and 
  abstractions? -->
It is recommended to read an introduction into Exonum before proceeding with
this tutorial.

The full tutorial code is available in our Git repository. 

## Prerequisites

The following software must be installed:

- JDK 11+
- Apache Maven 3.6+
- Python 3.6+
- Exonum Java 0.10
- cURL.

## Service Overview

Blockchains are often used to implement secure registries. In this tutorial,
we will implement a vehicle registry. The registry will keep a record of
vehicles; and allow to create new vehicles, and change their owner.
It will also provide REST API to query the registry.

<!-- todo: Or just keep going at h2? --> 
## Service Implementation

### 1 Creating a Project

#### Generate from Template

First, create a new service project with a Maven archetype.

```shell
mvn archetype:generate \
    -DarchetypeGroupId=com.exonum.binding \
    -DarchetypeArtifactId=exonum-java-binding-service-archetype \
    -DarchetypeVersion=0.10.0
```

<!-- 
todo: Or replace with a non-interactive command, so that we don't rely
on user input? 
--> 
When prompted, enter the values of project properties, for example:

- `com.example.car` for `groupId`
- `car-registry` for `artifactId`
- `1.0.0-SNAPSHOT` for `version`

Keep the default for `package` and confirm the input.

Verify that the project has been generated correctly and the dependencies
are installed by running its integration tests:

```shell
cd car-registry/
mvn verify
```

You shall see in the output that `com.example.car.MyServiceIntegrationTest`
completed successfully and the build passes.

??? fail "Getting a build error?"
    - If you get `java.lang.LinkageError` in the test, check that Exonum Java 
    is installed correctly. Particularly, check that `EXONUM_HOME` environment
    variable is set to the Exonum Java installation location.
    See the [installation instructions](./java-binding.md#installation) 
    for details.
    - If you get a compilation error `invalid flag: --release`, Maven likely
    uses Java 8 to compile the project. Check:
         - That the Java on `PATH` is 11 or above: `java -version`
         - That the `JAVA_HOME` environment variable is unset; 
         or points to a JDK installation 11 or above: `echo "$JAVA_HOME"`

#### Skeleton Project Overview

The generated project is a mere "skeleton". It consists of two modules:

- `car-registry-messages` for the definitions of service messages. 
- `car-registry-service` for the service business logic.

### 2 Declare Service Persistent Data

!!! tip
    Import the project into your IDE if you haven't already.

Our vehicle registry needs to store the following information about
a vehicle:

- An identifier
- A manufacturer (e.g., "Ford")
- A model (e.g., "Focus")
- Its owner (e.g., "Dave").

Let's define the car object. We will use a protobuf message, because
Exonum stores objects in a serialized form. Create a `vehicle.proto`
in `car-registry-messages`
(`car-registry-messages/src/main/proto/example/vehicle`):

<!--codeinclude-->
[vehicle.proto](../../code-examples/java/exonum-java-binding/tutorials/car-registry/car-registry-messages/src/main/proto/example/vehicle/vehicle.proto) 
<!--/codeinclude-->

Run `mvn generate-sources` to compile the message.

---

Next, we will define the persistent data of our service. Exonum Services define
their persistent data in a _schema_: a set of named, persistent, typed
collections, also known as indexes. Our project already has a template schema
`MySchema` — navigate to it.

<!-- todo: Shall we include here a MySchema template or is it redundant? -->

The `MySchema` has a field `access` of type `Prefixed`, initialized in
its constructor. It is a database access object, which allows to access
the indexes of this service.

To keep a registry of vehicles indexed by their IDs, we will use a `ProofMap`
index with `String` keys and `Vehicle` values, named `vehicles`.
We will expose our index through a factory method — a method that will create
a new `ProofMap`. Use `access.getProofMap` method to create the `vehicles` index:

<!--codeinclude-->
[](../../code-examples/java/exonum-java-binding/tutorials/car-registry/car-registry-service/src/main/java/com/example/car/MySchema.java) inside_block:ci-vehicles
<!--/codeinclude-->

Notice that the `access.getProofMap` accepts three parameters:

- an index _address_ identifying this index in the blockchain
- two serializers: one for keys and one for values. Exonum needs the serializers
  to convert objects into bytes and back, as it stores the objects as bytes. 
  For `String` keys, we use a standard serializer. For `Vehicle`s, which
  are Protocol Buffers messages, we use a corresponding serializer for messages
  of `Vehicle` type.

!!! tip
    As the [`StandardSerializers.protobuf`][protobuf-serializer] uses reflection
    to look up the needed methods in the message class, it is recommended
    to instantiate a protobuf serializer once for each type
    _and_ keep it in a `static` field.

[protobuf-serializer]: https://exonum.com/doc/api/java-binding/0.10.0/com/exonum/binding/common/serialization/StandardSerializers.html#protobuf(java.lang.Class)

??? fail "No Vehicle class?"
    In some IDEs, e.g. IntelliJ IDEA, it might be needed to manually
    mark `car-registry-messages/target/generated-sources/protobuf/java`
    directory as "Generated Sources Root" to be able to import the generated
    classes:
    
    1. Open context menu (right click on the directory)
    2. "Mark Directory As" > "Generated Sources Root"
  
Compile the project:

```shell
mvn compile
```

<!--
Keeping the service data in the `ProofMap` ensures that the data is the same
on each node in the network.
-->

<!--
todo: Shall we add a whole file of MySchema?
-->

<!-- 
Todo: Shall we draw a parallel with the DAO objects in business
applications?
-->

<!--
Todo: Shall we include the references to extra info on MerkleDB,
indexes, serialization and serializers?
-->

### 3 Service Transactions

Our service needs two operations updating its state:

- Add a new vehicle entry to the registry
- Transfer the ownership over the vehicle to another user.

Modifying operations in Exonum are called transactions. Transactions are
implemented as methods in a service class — a class implementing `Service`
interface. A transaction method must be annotated with `@Transaction`
annotation.

Our project already has a template service `MyService` — navigate to it.

#### Add Vehicle Transaction

First, let's define the transaction arguments. As Exonum expects transaction
arguments in a serialized form, we will define the arguments as a protobuf
message.

Add a new file `transactions.proto` in `car-registry-messages` 
(`car-registry-messages/src/main/proto/example/vehicle`).

<!-- 
todo: Again, shall we include a code example of an empty file
(with package, option java_package, etc.)?
-->

Then add the message definition of the _Add Vehicle_ transaction:

<!--codeinclude-->
[](../../code-examples/java/exonum-java-binding/tutorials/car-registry/car-registry-messages/src/main/proto/example/vehicle/transactions.proto) inside_block:ci-add-vehicle
<!--/codeinclude-->

Compile the message:

```shell
mvn generate-sources
```

---

Next, let's write the transaction method. Navigate back to `MyService`,
and add the following method:

<!--codeinclude-->
[](../../code-examples/java/exonum-java-binding/tutorials/car-registry/car-registry-service/src/main/java/com/example/car/MyService.java) inside_block:ci-add-vehicle
<!--/codeinclude-->

The annotation accepts an integral _transaction ID_: an identifier of
the transaction that service clients use to invoke it.

The method accepts `AddVehicle` class: an auto-generated class from our
protobuf definition. It also accepts the `TransactionContext` allowing
the transaction to access the database.

The transaction implementation uses the service data schema `MySchema`
to access its data.

Note that the transaction throws an `ExecutionException` in case of
a precondition failure: in this case, an attempt to add a vehicle with
an existing ID.

<!--
todo: Shall we add the ids? If so, how do we split them? Or just use the literals?
-->

Compile the code:

```shell
mvn compile
```

#### Transfer the Ownership Transaction

Let's add the second transaction which will change the owner of a vehicle
in the registry. It needs as its arguments the ID of the vehicle;
and a new owner.

Navigate to `transactions.proto` and add a message with the arguments:

<!--codeinclude-->
[](../../code-examples/java/exonum-java-binding/tutorials/car-registry/car-registry-messages/src/main/proto/example/vehicle/transactions.proto) block:ChangeOwner
<!--/codeinclude-->

Compile the message:

```shell
mvn generate-sources
```

Then navigate to the service `MyService` and add an implementation with
appropriate constants:

<!--codeinclude-->
[](../../code-examples/java/exonum-java-binding/tutorials/car-registry/car-registry-service/src/main/java/com/example/car/MyService.java) inside_block:ci-change-owner
<!--/codeinclude-->

This transaction is similar to the first. 

Notice how an update of the `owner` field in an existing `Vehicle` value
is performed. It creates a builder from the existing object with 
`Vehicle.newBuilder(templateVehicle)` method, updates the field, and builds
a new object.

Compile the code:

```shell
mvn compile
```

<!-- 
TODO: As an exercise, we may suggest to extend the error checks:
  - Forbid transfer to yourself
  - Forbid transfer to empty owner
-->

#### Service Constructor

Finally, we will add a _service constructor_ — a special type of a transaction,
that is invoked once when the service is instantiated. We will use it
to populate our registry with some test data.

It is implemented as the `Service#initialize` method. By default, it has
an empty implementation in the interface, hence it is not yet present 
in `MyService`.

Override the `Service#initialize` with the following implementation:

<!--codeinclude-->
[](../../code-examples/java/exonum-java-binding/tutorials/car-registry/car-registry-service/src/main/java/com/example/car/MyService.java) inside_block:ci-initialize
<!--/codeinclude-->

Note that this method delegates to the `addVehicle` transaction method
we have added earlier.

<!-- 
TODO: As an exercise, we may suggest to pass the test data in a "configuration".
(or some other configuration).
-->

!!! success
    In this section we have learned how to implement operations modifying
    the blockchain state: transactions and the service constructor. 
    <!-- todo: "There are more operations of such type: ..." — what is
    the canonical reference on the topic? -->

### 4 Service API

In the previous section we have implemented operations modifying the blockchain
state. Applications usually also need a means to _query_ data. In this section,
we will add an operation to retrieve a vehicle entry by its ID
from the registry. This operation will be exposed through REST API.

#### Find Vehicle Service Operation

First, we need to add a query operation to the Service:

<!-- FIXME: Replace lines: selector with inside_block:ci-find-vehicle when
the bug with braces is resolved: -->
<!--codeinclude-->
[MyService.findVehicle](../../code-examples/java/exonum-java-binding/tutorials/car-registry/car-registry-service/src/main/java/com/example/car/MyService.java) lines:137-145 
<!--/codeinclude-->

Although this query method will be invoked by our code, hence the signature 
we use may be arbitrary, the signature is similar to the transaction methods:
it takes the operation arguments and the context (here: `String` ID
and `BlockchainData` context). 

#### API Controller

<!-- As Exonum does not provide a means to invoke such read operations,
we will
-->

Next, we will add a class implementing the REST API of the service.
It will expose our "find vehicle" operation as a `GET` method.

Create a new `ApiController` class:

<!--codeinclude-->
[](../../code-examples/java/exonum-java-binding/tutorials/car-registry/car-registry-service/src/main/java/com/example/car/ApiController.java) block:ApiController
<!--/codeinclude-->

The `ApiController` needs a `MyService` object to query data; and
a `Node` object to obtain the needed context: `BlockchainData`.

!!! note
    We encode the response in Protocol Buffers binary format for brevity.
    The controller may encode it any suitable format (e.g., JSON).

Finally, connect the controller to the service. `MyService` already has
an empty `createPublicApiHandlers` method, modify it to have:

<!--codeinclude-->
[MyService.createPublicApiHandlers](../../code-examples/java/exonum-java-binding/tutorials/car-registry/car-registry-service/src/main/java/com/example/car/MyService.java) inside_block:ci-createPublicApiHandlers
<!--/codeinclude-->

!!! success
    That's it with the service implementation! Package the _service artifact_
    and run the integration tests:
    
    ```shell
    mvn verify
    ```
    
    and proceed to the next section, where we will test its operation.
    

## Test Network

Let's now launch a test network in which we can see our service operation.
Our project already has a script launching a test network with a single
validator node: `start-testnet.sh`.

Run the script:

```shell
chmod 744 start-testnet.sh # Allow the script execution, needed once
./start-testnet.sh
``` 

When you see messages like the following, the network is active:

```
[2020-03-05T10:36:24Z INFO  exonum_node::consensus] COMMIT ====== height=4, proposer=0, round=1, committed=0, pool=0, hash=43ac20f8b...
```

Open a separate shell session and check the active services:

```shell
# You may pipe the response into `jq` to pretty-print it, if you have it
# installed:
curl -s http://127.0.0.1:3000/api/system/v1/services # | jq 
```

You can see in the output the lists of deployed _service artifacts_ and
_service instances_.
However, the network has neither our _service artifact_ nor
an _instance_ of our service. That is natural, because the service
must be registered in the network first, and then it may be instantiated.

### Service Instantiation

#### Install the Java Launcher

To register a service artifact that we built previously in the network,
we will need `exonum-launcher` tool. It is a Python application which we
recommend to install in a [virtual environment][python-venv]: 

```shell
python3 -m venv .venv
source .venv/bin/activate
```

[python-venv]: https://docs.python.org/3/library/venv.html

Then install the `exonum-launcher` with the Java runtime support:

```shell
pip install exonum-launcher-java-plugins
```

Check it works:

```shell
python -m exonum_launcher --help
```

#### Start a Test Instance

Next, we shall place the service artifact into an artifacts directory
of the node: `testnet/artifacts`.

```shell
# Create the artifacts directory
mkdir testnet/artifacts
# Copy the artifact
cp car-registry-service/target/car-registry-service-1.0.0-SNAPSHOT-artifact.jar \
   testnet/artifacts/
```
<!--
TODO: Shall the _node_ (= Java runtime) create an artifacts directory if one
does not exist already? If it shall, won't it cause problems if we launch
several nodes locally with the same (not yet existing) artifacts directory?
-->

<!--
TODO: Shall we place the burden of copying (= uploading the JAR)
on the launcher-plugin + Java runtime pair?
-->

And launch the service:

```shell
python -m exonum_launcher -i deploy-start-config.yml
```

The launcher must print the status of the service artifact deploy
and the service instance start. We can also verify that both operations
succeeded via the node API:

```shell
curl -s http://127.0.0.1:3000/api/system/v1/services | jq 
```

#### Invoke the Service Operations

...
