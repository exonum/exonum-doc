 This page describes a brief overview of the Exonum framework. How does it 
works? What problems does it sove? What does it consist of? You may find the 
deeper descriptions of the mentioned topics in the next sections. 

## 1. Blockchain 

Exonum is aimed to bring blockchain technology to the different projects, helps 
to make apps distributed. However, to get how Exonum could be used, we need to 
explain what blockchain is. 

Blockchain is literally a chain of blocks. Every next block includes the hash of 
the previous block; so, it is impossible to change one block without the 
appropriate changes for the each of the following blocks. In the matter, a 
blockchain is just a data storage with additional properties and requirements 
for the underlying data. **TODO: extend?** 

Different to the usual databases, a blockchain do not hold the data tables content directly. 
Instead, it holds every transaction that creates a new data value or changes the 
already existed data. Therefore, we can see the whole history of any data chunk. 
However, for the outer application, the blockchain represents just a usual 
Key-Value storage. 

Exonum blocks consist of the following parts. 

1. The hash of the previous exonum block. 
2. The list of the approved transactions. When the other nodes execute the 
block, they execute every transaction in the given order and apply changes to 
its data storage. 
3. The hash of a new data storage state. The state itself is not included; 
however, transactions are applied deterministically and unequivocally. The agreement on the hash of data storage is a part of the Exonum consensus algorithm, so it is guaranteed to coincide for all validators.
4. Service transactions. They do not participate in any business logic but are 
necessary for Exonum to ensure network availability. 

The Exonum holds a "data-storage" and "transactions" at the high level of 
abstraction. The Core provides transactions to be sent, received and executed; 
all the business logic should be implemented according to your needs. To build 
an application upon Exonum, user should define: 

- What is the scheme for a stored data (tables, fields, and so on)? 
- What types of the transactions do exist? 
- How should each transaction type be executed; what checks should be made 
before adopting the transaction? 

To go deeper, please refer to our demos and tutorials: **TODO: link to tutorials** 

## 2. The network structure 

The network consist of big amount of the connected peer-to-peer nodes. These 
nodes have different rights and different functionality. 

1. The full-nodes replicate the entire contents of the blockchain. They can generate new 
transactions but they cannot choose which transactions should be adopted. They 
cannot generate new blocks. 
2. The validators do not implement business logics. They provide the network 
stability. Despite of big amount of the nodes presented in the network, only 
validators can generate new blocks or vote for other block proposals. Other 
nodes just create business transactions and send them to the network. Validators 
receive these txs, check them, and include into the new block. The list of the 
validators is strictly limited, and normally should consist of 4-15 nodes. 
3. Lightweight clients do not need an every byte of the blockchain, so they held 
only part they are interested in. To get new (or absent) information they call 
to the full-nodes. Exonum provides a "proofs mechanism" allowing lightweight 
clients to check if the full-node answered fairly. Full-node cannot generate 
"fake" answer or fool around the client. 
4. Auditors, master-slave replicas, anchoring validators, and so on. Some nodes 
can take additional responsibilities, depending on the business goals or used 
services. 

## 3. Consensus 

Exonum uses the custom modification of Byzantine Fault-Tolerance Consensus to 
guarantee that in any time there is just one true version of the blockchain. To 
do so, the consensus between validators is needed in a decentralized environment where any node is allowed to fail.

When the validator generates a new block proposal, it sends it to the other 
validators. Every other validator checks the proposal and vote for it. After the 
new block proposal gets `+2/3` votes, this block is considered to be adopted. 
Validators broadcast it to the other full-nodes. 

Our BFT consensus gives the following properties: 

1. Up to `1/3` of validators can behave itself abnormally. They may be just 
turned off or even be hacked. However the network prolongs its activity and 
generates new blocks. No data or transactions are affected. 
2. New block requires `+2/3` validators signatures to be adopted. Therefore, if the previous condition is satisfied,
forks are impossible and the blockchain state is uniform for every node. 

To generate new block and vote upon it, the time is divided into the rounds. For 
every round, there is predefined Leader node. The Leader creates its block 
proposal in his round and sends it to other validators. Others check the 
proposal, and if it is correct, vote for it. If there is `+2/3` validators voted 
for any common proposal, the one is appointed to be a new block. 

If the Leader is turned off or did not generate appropriate block proposal, then 
the new round starts and the new Leader node appears. 

So, if `+2/3` of validators are honest ones, sometimes new correct block 
proposal will be generated and signed. 

Please, take into account that this description is very rough. If you are 
interested in the Consensus, Leader Election procedure or Block Generation 
procedure, please refer to **TODO: links for consensus, leader election** 

## 4. Data Storage 

```merkle??``` 

## 5. Modularity and services 

Exonum Framework includes the Core and the set of optional pluggable services. 
The Core is responsible for the consensus, and provides transactions and blocks 
to be sent, received and processed. The services may be developed by third-party 
developers and community; they extend Exonum functionality. To turn on a service 
you should add its sources to the project and compile new binaries. 

We represent the following optional services just now: 

1. Configuration Update service. Although every node has its own configuration 
file, some setups should be changed for every node simultaneously. This service 
allows updating configuration through the blockchain itself. In addition, 
administrators may apply new configuration values without node restarting. 
To get more about configuration service, please, refer to 
**TODO: link to config-service**. 
2. Anchoring service. It writes the hash of the current blockchain state to the 
bitcoin blockchain. It brings new guarantees: even if the malefactor takes 
control over every validator, he cannot rebuild blockchain and change old 
transactions quietly. If he tries so, then the hash of the new block would 
differ from the one written in the bitcoin blockchain. Every other node would 
check it and alert about a mismatch. Therefore, the anchoring service gives 
additional durability: to change the data retroactively the hacker should hack 
bitcoin blockchain, and it is impossible just now. To get more about anchoring, 
please, refer to **TODO: link to anchoring**. 
3. Your services. You may easily create new services or just take one already 
written by the community. Please, refer to **TODO: link to services 
description** to know how services may be written. 

## 6. Open source 

Exonum Core is released under the Apache 2.0 **TODO: is it correct?** open 
source license. You may use it free with respect to the license conditions. 

## 7. Rust 

Exonum Core is written on the [Rust](https://www.rust-lang.org/) language. This 
language is security-oriented and compiles to the native code. Just now, you may write 
your business logics on the Rust only, however we hardly work to release the bindings for Java soon. **TODO: CHECK, 
PLEASE. Will it be to open-source? What else could be said here?** 

## 8. Demos 

To get more how Exonum may be used, you may refer to our demos and tutorials. 
They represent real applications upon the Exonum Core. You may get how they are 
written or just download and play around it. 

**TODO: links to the demos and tutorials** 

