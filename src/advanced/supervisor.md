# Supervisor Service

**Supervisor** is an Exonum [service](../architecture/services.md)
controlling the [service lifecycle](../architecture/service-lifecycle.md).
In the reference implementation, supervisor actions are authorized
by the supermajority of node administrators.

More precisely, the supervisor service is controlling
the following activities:

- Service artifact deployment
- Service instances creation
- Changing consensus configuration
- Changing service instances configuration
- Migrating service data

The remaining part of the article will mainly focus on the reference
implementation of the supervisor, i.e., the `exonum-supervisor` crate.
Keep in mind that other implementations are possible, which can
widely change the service workflow; this is discussed
in the [*Supervisor and Core*](#supervisor-and-core) section.

## Supervisor and Core

From the core perspective, the supervisor is an ordinary service
with an access to some core APIs related to the service lifecycle,
which are otherwise hidden.

!!! note
    In the current implementation, the supervisor service is distinguished
    by its numerical ID, which must equal 0. However,
    [there are plans](../roadmap.md) to transition to the
    [capability model] in order to make blockchain administration more
    flexible.

In the supervisor – core relations,
the core is responsible for *implementing* service lifecycle events,
while the supervisor is responsible for *authorizing* these events.
This loose coupling allows to develop the supervisor independently
of the core and vary authorization depending on the use case (for example,
simple Exonum blockchains may have a single party authorizing all events,
while more complex blockchains may utilize decentralized workflow).

Another benefit of implementing supervisor as a service is that
transactions provide a fully auditable log of the service lifecycle.
Since service lifecycle is controlled via transactions, we can
guarantee out of the box that it is replicated among all nodes in
the network and has the same outcome.

Finally, the supervisor service may be implemented in any
[runtime](../glossary.md#runtime) supported by Exonum.

## General Idea

!!! tip
    Consult the [`exonum-supervisor` crate docs](https://docs.rs/exonum-supervisor/)
    for more technical documentation.

Service lifecycle events are initiated via *proposal* transactions
to the supervisor service.
A transaction needs to be signed by the service key of a validator
node; it is assumed that such a transaction reflects the will of
the node admin. The transactions are generated via private HTTP endpoints
of the service.

Each proposal needs to gather approval among validator nodes.
Nodes approve the proposal by sending an approval transaction
signed by the service key of the node. The definition of approval
depends on the [mode of service operation](#modes-of-operation).

Once a proposal gets the necessary approval, it results in the call to
the core to perform the corresponding lifecycle event. Depending on
the event type, the call can be made in the handler of a latest approval
transaction, or in the “after transactions” hook of the supervisor service.

Some lifecycle events, such as artifact deployment and data migration,
are *asynchronous*, meaning that they are performed in the background,
potentially at different speeds for different nodes. For such events,
each validator node reports via a transaction the local outcome of the event
once it is finished. Judging on the collected outcomes, the event can
be considered successful or unsuccessful globally (i.e., for all nodes
in the network, including auditors).

As an example, local artifact deployment can be either successful or
return a certain error. If all validator nodes have reported successful
deployment of an artifact, it is then considered necessary for deployment
for all nodes in the network. The nodes that have not deployed the artifact
by this point (e.g., auditors or a node that executes transaction log
retrospectively) will block until the artifact is deployed.

To avoid “hang-ups,” asynchronous events have a deadline expressed
in terms of the blockchain height. If an event is not successfully completed
by a deadline, it is considered aborted network-wide.

## Modes of Operation

The reference supervisor service has two different operating modes:
a “simple” mode and a “decentralized” mode. The mode is set during
service instantiation and can be changed via configuration mechanism.

The difference between modes is in the decision making approach:

- Within the decentralized mode, to deploy a service or apply a new
  configuration, more than 2/3 of validators should reach a consensus.
- Within the simple mode, any decision is executed after a single validator
  approval.

!!! note
    The threshold of 2/3 of validators is chosen to reflect the security
    model used in [the consensus algorithm](../architecture/consensus.md).
    According to this model, up to 1/3 of validators may be compromised or be
    non-responsive at any time.

The simple mode can be useful if one network administrator manages all the
validator nodes or for testing purposes (e.g., to [test](service-testing.md)
service configuration).

For a network with a low node confidence, consider using the decentralized
mode.

## Service Configuration

Besides core lifecycle events, the supervisor can also manage service
(re)configuration. To accomplish this, a service should implement the
`exonum.Configure` [interface](../glossary.md#interface), which has
two operations:

- Validation of a configuration
- Application of a configuration

Here, configuration is defined as a sequence of bytes; its interpretation
is the responsibility of the service. By convention, configuration
should be serialized as a Protobuf message.

!!! warning
    Beware that interfaces are an unstable feature of the Exonum framework.
    Their details may significantly change in the future releases. Thus,
    implementing the configuration interface should be performed at your
    risk.

The service should check that both these operations are authorized
by the supervisor service. The supervisor guarantees that it will only apply
previously successfully verified configs.

From the supervisor side, configuring services follows the proposal / approval
paradigm described above. In fact, configuration changes can be batched
together and with synchronous lifecycle events (e.g., service instantiation).
This provides greater flexibility and determinism.

[capability model]: https://en.wikipedia.org/wiki/Capability-based_security
