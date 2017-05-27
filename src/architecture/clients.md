# Lightweight Clients

To improve system auditability, Exonum includes a [**light
client**](https://github.com/exonum/exonum-client). Light client is a
JavaScript library with a number of helper functions available for use by
frontend developers. These helper functions are used to
verify blockchain responses on the client side. That's why it is a good practice
to include specific cryptographic proofs into the blockchain backend responses
along with validating these proofs on the client side.

The helper functions are divided into the following submodules:

- **Data**. Functions for [serialization and deserialization of
  data](../advanced/serialization) from the JSON format to
  Exonum binary format
- **Cryptography**. Functions for calculating hashes, creating
  and validating digital signatures
- **Proofs**. Functions for checking cryptographic proofs that
  are returned by the blockchain, such as the functions for
  checking the proofs for [Merkle](../advanced/merkle-index)
  and [Merkle Patricia](../advanced/merkle-patricia-index) indexes
- **Blockchain integrity checks**. Function for checking the
  validity of a block (its compliance with [consensus
  algorithm](../advanced/consensus/consensus))

**Notice.** A hash of the entire blockchain state is a part of each block
(see [data storage](storage.md)). This hash is formed using Merkle
and Merkle Patricia indexes. Thus, using functions for proof verification, one can
verify the commitment of any blockchain data in a block. The block itself
can be verified using blockchain integrity verification.

There are two typical use cases for the light client:

- Forming and sending transactions to the Exonum blockchain network
- Forming [requests](services.md#read-requests) to full nodes of the network
  (normally, HTTP GET requests) and validation of the responses

## Transaction Creation

In this and next section all functions indicated in *italics* are the functions
implemented in Exonum light client.

1. Frontend triggered by an event (for example, a button click handler)
  decides to create a new transaction
2. The transaction data is stored in JSON format. Then the data is
  *converted to the Exonum binary format* and *digitally signed*
3. The generated transaction (JSON data + digital signature) is sent to the
  a full node via an HTTP POST request

**Notice.** Serialization during signing is a necessary step, since all
data (including transactions) is stored in Exonum in a [custom binary
format](../advanced/serialization.md). This is done for several reasons:

- The binary format is unambiguous, while the same data can have multiple JSON
  representations (which would lead to different hashes of logically the same data)
- The data stored in the binary format consumes less disk space
- Access to a field in a binary format can be implemented using fast pointer
  arithmetic; the same operation for JSON data would require multiple reads

## Sending Requests

1. The client forms an HTTP GET request and sends it to a full node in the Exonum
  blockchain network
2. The node forms a response to the request and the corresponding
  cryptographic proof and sends both back to the client
3. The client, on receiving the response from the blockchain, *verifies the structure*
  and *validates cryptographic proofs* for the response
4. The result of checks is shown in the user interface

**Notice.**  In the case user authentication in needed (for example, for data
access management), requests can be *digitally signed*.

## Motivation

Blockchain, as a technology that expands the capabilities of distributed
databases, implies the possibility of auditing or validating stored
information. This audit can be done in several ways.

In a system with full nodes (nodes that store the full copy of a blockchain),
audit can be performed automatically during operation of such nodes. When a new
block is received, a full node verifies its compliance with the
consensus algorithm and the correctness of transaction execution. Such an
**"audit by dedicated auditor nodes"** can be effective in case it is performed
by external independent parties. However, it has a number of drawbacks:

- To perform audit, one needs a full copy of a blockchain and
  enough computational resources to stay in sync with the blockchain validators
- This type of audit needs to be permanent to ensure the correctness of
  system state
- In order to start auditing, a full auditor node must reach the current height
  of the blockchain. This could take long time, especially if
  the blockchain has substantial transaction throughput
- **An end user of the system is forced to trust pair "validators" +
  "auditors"**, since he has no way to verify the correctness of blockchain
  data. As a matter of fact, such blockchain is equal to distributed database
  from the user's point of view.

One of the ways to address the drawbacks of "audit by dedicated auditor
nodes" is to introduce *light clients*, also known as
*lightweight clients*, *thin clients* or just *clients*. For the Bitcoin
blockchain, these clients are also known as [SPV (simple payment verification)
clients](https://en.bitcoin.it/wiki/Thin_Client_Security). Light clients are
programs able to replicate and verify a small portion of information stored in the
blockchain. Usually clients verify information relevant to a specific
user (for example, the history of his transactions). This verification is
possible due to the use of specific data containers in a blockchain:
[Merkle](http://exonum.com/doc/advanced/merkle-index) and [Merkle
Patricia](http://exonum.com/doc/advanced/merkle-patricia-index) indexes.

Advantages of this approach are:

- **No need to trust third parties**: verification of
  all data returned by a blockchain in response to queries is performed by the
  user himself on his machine
- Constant audit of the system is possible without requiring
  computational resources comparable to validators in terms of performance. Only
  the relevant data is audited
- To start or resume the audit of the system, no synchronization period is
  required

**Notice.** The user still needs to trust the light client developers if the client
has closed source. Alternatively, the user should perform an
audit of light client code to remove the necessity of trust to
third parties completely.

The presence of light clients does not mean the absence of auditor nodes, since
their tasks are different. Light clients verify particular user's data, while
auditor nodes verify a blockchain as a whole.

The presence of light clients in a blockchain-based system leads to certain
difficulties during development:

- Backend developers should agree with client developers on API requests and
  the format of cryptographic proofs (in fact, blockchain data model)
- Any changes in blockchain data model should be accompanied with relevant
  changes in the logic of proof verification performed by light clients
- Since the light client substantially expands an access to Exonum REST endpoints
  with cryptography, it may be necessary to create multiple light clients and
  continuously support their codebase

**Notice.** The first two problems above can be overcome with the aid of data
schema, stated in a language independent format (see [Exonum
roadmap](../dev/roadmap.md))

Despite the complexity of the development, **the presence of
light clients in a blockchain-based system is the only practical way to remove
the necessity of trust to third parties**.
