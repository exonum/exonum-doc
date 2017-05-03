
Here you may find the short description of how Exonum works and what does it consist of.

## 1. Blockchain

Blockchain is a chain of blocks. Every next block includes the hash of the previous block; so, it is impossible to change one block without the appropriate changes for the each of the following blocks. In the matter, blockchain is just a data storage with additional properties and requirements for the underlying data.
**TODO: extend?**

Different to the usual databases, blockchain do not held the data inself. Instead it held every transaction that creates new data value or changes already existed data. So, we may see all the history of any data chunk. However, from the outer point of view, it could be used like a usual Key-Value storage.

Exonum blocks are consist of the following parts.
1. The hash of the previous exonum block
2. The list of the approved transactions. When other nodes execute block, they execute every transaction in the order and apply changes to its data-storage.
3. The hash of a new data-storage state. The state itself is not included; but as transactions are applied determisitically and uneqivocally, the hash of data-storage should coincide for different nodes.
4. Service transactions. They do not participate in any business logic but are necessary for Exonum to ensure network availability.
**TODO: check**

The Exonum helds "data-storage" and "transactions" at the high level of abstraction. The Core provides transactions to be sent, received and executed; all the business logic should be implemented according to your needs.
User should define:
	What is the scheme for stored data (tables, fields, etc.)
	What types of the transactions do exist
	How should each transaction type be executed; what checks should be made before adopting the transaction.

To go deeper, please refer to ours demos and tutorials: **TODO: link to demos**

## 2. The network structure

The network consist of the big amount of connected peer-to-peer nodes. These nodes have different rights and different functionality.

1. Full-nodes save the whole copy of the blockchain. They can generate new transactions but they could not choose which transactions shoulw be adopted. The could not generate new blocks.
2. Validators do not implement business logics. They provide the network stability. Validators gather transactions from the whole network, check them, generate new block and vote for it. After new block proposal gets +2/3 votes, this block is considered to be adopted and is bloadcasted to the other nodes. The list of validators is strictly limited, and normally should consist of 5-15 nodes.
3. Lightweight clients do not need in the every byte of the blockchain, so they held only part they are interested in. To get new (or absent) information they call to full-nodes. Exonum provides a "proofs mechanizm" allowing lightweight clients to check if the full-node answered fairly. Full-node can not generate "fake" answer or fool around the client.
4. Auditors, master-slave replicas, anchoring validators, etc. Some nodes can take additional responcibilities, depending on the business goals or used services.

## 3. Consensus

Exonum uses custom modification of Byzantine Fault-Tolerance Consensus to guarantee blocks would be adopted by each node synchoniously. Despite of big amount on nodes presented in the network, only validators can generate new blocks or vote for other block proposals. Other nodes just create business transactions and send them to the network. Validators receive these txs and include into the new block.
Our BFT consensus gives the following properties:

1. +2/3 validators signatures are required to adopt new block. So, forks are impossible and blockchain state is uniform for every node.
2. Up to 1/3 of validators can behafe itself abnormally. They may be just turned off or even be hacked. However the network prolongs its activity, new blocks are generated.

To generate new block and vote upon it, the time is divided into the rounds. For every round there is predefined Leader node. The Leader creates its block proposal in his round and sends it to other validators. The others check proposal, and if it is correct, vote for it. If there is `+2/3` validators voted for any common proposal, the one is appointed to be a new block.
If the Leader is turned off or didn't generate appropriate block proposal, then the new round starts and the new Leader node appears.
So, if `+2/3` of validators are honest ones, sometimes new correct block proposal will be generated and signed.

Please, take into account that it is very rough description here. If you are interested in the Consensus, Leader Election procedure or Block Generation procedure, please refer to **TODO: links for consensus, leader election**

## 4. Data Storage
```merkle??```


## 5. Modularity and services

Exonum Framework includes the Core and the set of optional pluggable services. The Core is responsible for consensus, and provides transactions and blocks to be sent, received and processed. The services may be developed by third-party developers and community; they extend exonum functionality. To turn on a service you should add its sources to the project and compile new binaries.

We represent the following optional services just now:

1. Configuration Update service. 
Although every node has its own configuration file, there are some setups that should be changed for every node simultaneously. This service allows to update configuration through the blockchain itself. Also new configuration values can be applied without node restarting. **TODO: am I right?** To get more about configuration service, please, refer to **TODO: link to config-service**.

2. Anchoring service. It writes the hash of the current blockchain state to the bitcoin blockchain. It brings new guarantees: even if the malefactor takes control over every validator, he can not rebuild blockchain and change old transactions quietly. If he tries so, then the hash of the new block would differ from the one written in the bitcoin blockchain. Every other node would check it and alert about mismatch. So, anchoring service gives additional durability: to change data retroactively the hacker should hack bitcoin blockchain, that is impossible just now. To get more about anchoring, please, refer to **TODO: link to anchoring**.

3. Your services. You may easily create new services or just take ones already written by the community. Please, refer to **TODO: link to services description** to know how services may be written.


## 6. Опен-сорц и Enterprise

Exonum Core is open-source and released under Apache 2.0 **TODO: is it correct?** license. You may use it for free with respect to the license conditions.  
We develop Enterprise version upon the Exonum Core; it include additional features that may be necessary for the goverments and enterprise clients. Here we are developing:

- graphical interface, dashboards, reports;
- the certain cryptographic algoritms certified by the regulators will be also implemented here;
- integration with the others corporate systems;
-**TODO: yes?**

## 7. Rust

Exonum Core is written on the Rust language **TODO: link**. The main reason is the language is security-oriented, compiled to the native code. You may write your business logics on the Rust, C++ or use our bindings for Java. **TODO: CHECK, PLEASE. will it be to open-source? may C++ be used? what else could be said here?**

## 8. Demos

To et more how Exonum may be used, you may refer to our demos and tutorials. They represent a real applications upon the Exonum Core. You may get how they are written or just download anp play around it.

**TODO: links to the demos and tutorials**