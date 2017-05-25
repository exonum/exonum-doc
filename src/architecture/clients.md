# Lightweight Clients

For the reasons of auditing the system, Exonum includes [**light
client**](https://github.com/exonum/exonum-client). Light client is a
JavaScript library with a number of helper functions available for use by
frontend developer. Using light client helper functions is the only way to
verify blockchain responses on a client side. That's why, it is a good practice
to include specific cryptographic proofs into the blockchain backend response
along with validating these proofs on a client side.

The helper functions are divided into the following submodules:

1. **Data**. The functions for [serialization and deserialization of
  data](../advanced/serialization) from the JSON format to
  Exonums' binary format.
2. **Cryptography**. The functions for calculating hashes, creating
  and validating digital signatures.
3. **Proofs**. The functions for checking cryptographic proofs, that
  are returned by the blockchain. In particular, the functions for
  checking the proofs for [Merkle](../advanced/merkle-index)
  and [Merkle Patricia](../advanced/merkle-patricia-index) indexes.
4. **Blockchain structures checks**. The function for checking the
  validity of a block (its compliance with [consensus
  algorithm](../advanced/consensus/consensus))

**Notice.** A hash of a blockchain state is stored in each block (see [data
storage](storage.md)). This hash is formed using Merkle and Merkle Patricia
indexes. This means that using functions for proofs check one can verify the
commitment of any blockchain data in a block. The block itself can be verified
using blockchain structure check function.

There are two typical scenarios for light client usage:

1. Forming and sending of a transaction
2. Forming a [request](services.md#read-requests) (normally, an HTTP GET
  request) and validation of the response

## Transaction forming

In this and next section all functions indicated in *italics* are the functions
implemented in Exonum light client.

1. Frontend triggered by an event (for example, a button click handler),
  decides to create a new transaction
2. The necessary data is stored in JSON format. Then, using *serialization
  function*, the data is transferred to a binary format, and digitally signed by
  *the function of digital signature creation*.
3. Generated transaction (JSON data + digital signature) is sent to the
  blockchain backend via HTTP request

**Notice.** Serialization during the signing is a necessary step, because the
data (including transactions) is stored in a blockchain in a [custom binary
format](../advanced/serialization.md). This is done for several reasons:

1. The binary format is unambiguous, while the same data can have multiple JSON
  representations, which leads to different hashes of this data
2. The data stored in the binary format consumes less disk space
3. Access to a field in a binary format can be implemented using pointer
  arithmetics, which is fast; while the same operation in JSON will require
  multiple data reads

## Sending a request to a blockchain

1. Frontend forms an HTTP request and sends it to Exonum blockchain.
2. Exonum blockchain forms a response to the request and the corresponding
  cryptographic proof and sends both back to the frontend
3. Frontend, receiving the response from the blockchain, use *functions for
  blockchain structures checks* and *functions of cryptographic proof checks*
  for the response verification
4. The result of checks is shown to the user

**Notice.**  In the case user authentication in needed (for example, for data
access management), one can use the same *digital signing functions*.

# Motivation

Blockchain, as a technology, that expands the capabilities of distributed
databases, implies the possibility of auditing or validating stored
information. This audit can be done in several ways.

In system with full nodes (nodes that store the full copy of a blockchain),
audit can be performed automatically during operation of such nodes: when a new
block is received, the full node can verify its compliance with the
consensus algorithm and the correctness of transaction execution. Such an
**"audit by dedicated auditor nodes"** can be effective in case it is performed
by external independent parties. However, it has a number of drawbacks:

1. To perform this type of audit, one needs a full copy of a blockchain and
  computing resources able to work at a sufficient speed to be
  at the same blockchain height as validator nodes
2. This type of audit should be permanent to ensure the correctness of
  system state
3. In order to start audit, possibly long synchronization period is needed.
  During this period a full auditor node must reach the current state of a
  blockchain (the current height)
4. **The user of the system is forced to trust pair "validators" +
  "auditors"**, since he has no way to verify the correctness of blockchain
  data. As a matter of fact, such blockchain is equal to distributed database
  from the user's point of view.

One of the ways to address the drawbacks of **"audit by dedicated auditor
nodes"** is to introduce **light clients**, which commonly are known as
**lightweight clients**, **thin clients** or just **clients** (for Bitcoin
blockchain these clients are also knowns as [SPV (simple payment verification)
clients](https://en.bitcoin.it/wiki/Thin_Client_Security)). Light clients are
programs, that are able to verify a small piece of information stored in the
blockchain. Usually clients verify information, that is relevant to a specific
user (for example, the history of his transactions). This verification is
possible due to use of specific data containers in a blockchain:
[Merkle](http://exonum.com/doc/advanced/merkle-index) and [Merkle
Patricia](http://exonum.com/doc/advanced/merkle-patricia-index) indexes.
Advantages of this approach are:

1. **The absence of the necessity of trust to third parties**: verification of
  all data, returned by a blockchain in response to queries, is performed by the
  user himself on his machine.
2. Constant audit of the system is possible without the necessity of having
  computational resources comparable to validators in terms of performance. Only
  the relevant data is audited.
3. To start or resume the audit of the system, no synchronization period is
  required.

**Notice.** The user still needs to trust the light client developers, in case
it's distributed closed source. Or, alternatively, the user should perform an
audit of light client code, if it's needed to remove the necessity of trust to
third parties completely.

The presence of light clients does not mean the absence of auditor nodes, since
their tasks are different. Light clients verify particular users' data, while
auditor nodes verify a blockchain as a whole.

The presence of light clients in the blockchain-based system leads to certain
difficulties during its' development:

1. Backend developers should agree with client developers on API requests and
  the format of cryptographic proofs (in fact, blockchain data model).
2. Any changes in blockchain data model should be accompanied with relevant
  changes in the logic of proof verification, performed by light clients
3. Since light client substantially expands an access to Exonum REST endpoints
  with cryptography, it may be necessary to create multiple light clients and
  continuously support their codebase

**Notice.** The first two problems above can be overcome with the aid of data
schema, stated in a language independent format (see [Exonum
roadmap](../dev/roadmap.md))

Nevertheless, despite the complexity of the development, **the presence of
light clients in a blockchain-based system is the only practical way to remove
the necessity of user trust to third parties**.
