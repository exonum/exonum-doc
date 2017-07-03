# Networking Specification

## Network Structure

The Exonum network consists of [_full nodes_](../glossary.md#full-node)
connected via peer-to-peer connections, and [_light clients_](../glossary.md#light-client).

### Full Nodes

**Full nodes** replicate the entire contents of the blockchain and correspond to
replicas in distributed databases. All the full nodes are authenticated with
[public-key cryptography](../glossary.md#digital-signature). Full nodes are
further subdivided into 2 categories:

- [**Auditors**](../glossary.md#auditor) replicate the entire contents of the
  blockchain. They can generate new transactions, but cannot choose which
  transactions should be committed (i.e., cannot generate new blocks)
- [**Validators**](../glossary.md#validator) provide the network liveness. Only
  validators can generate new blocks by using a [Byzantine fault](../glossary.md#byzantine-node)
  tolerant consensus algorithm. Validators receive transactions, verify them,
  and include into a new block. The list of the validators is restricted by
  network maintainers, and normally should consist of 4–15 nodes

### Light Clients

!!! tip
    See [separate article](../architecture/clients.md) for more details on
    _light clients_.

**Light clients** represent clients in the client-server paradigm; they connect
to full nodes to retrieve information from the blockchain they are
interested in, and to send transactions. Exonum provides a [“proofs mechanism”](../glossary.md#merkle-proof),
based on cryptographic commitments via Merkle / Merkle Patricia
trees. This mechanism allows verifying that a response from the full node
has been really authorized by supermajority of validators.
