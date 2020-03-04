# First Exonum Java Service Tutorial

This tutorial is aimed at beginners in Exonum Java. It is an introduction
into service development in Java. As such, it does not cover some important
to real-world services topics, like authorization or proofs of authenticity
for service data, but gives a foundation to learn about that in subsequent
materials.

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
- Exonum Java 0.10.

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
[vehicle.proto](../../code-examples/java/exonum-java-binding/testing/src/main/java/com/exonum/binding/test/Bytes.java) block:fromHex
(code-examples/java/exonum-java-binding/tutorials/car-registry/car-registry-messages/src/main/proto/example/vehicle/vehicle.proto) 
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
[](../../code-examples/java/exonum-java-binding/testing/src/main/java/com/exonum/binding/test/Bytes.java) block:fromHex
(code-examples/java/exonum-java-binding/tutorials/car-registry/car-registry-service/src/main/java/com/example/car/MySchema.java) inside_block:ci-vehicles
<!--/codeinclude-->

Notice that the `access.getProofMap` accepts three parameters:

- an index _address_ identifying this index in the blockchain
- two serializers: one for keys and one for values. Exonum needs the serializers
  to convert objects into bytes and back, as it stores the objects as bytes. 
  For `String` keys, we use a standard serializer. For `Vehicle`s, which
  are Protocol Buffers messages, we use a corresponding serializer for messages
  of `Vehicle` type.

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


### 4 Service API 
