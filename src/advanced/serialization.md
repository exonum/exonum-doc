# Exonum Serialization Format

Serialization in Exonum differs from serialization in the usual sense, since
there is no process of transforming the structure into binary data. The data is
created already "serialized" and Exonum works directly with the serialized data
"deserializing" the fields to which it refers, if necessary.

In Exonum, the binary format is used for two purposes:

- **Message serialization**: everything that passes in the network between nodes
turns into messages (the `message!` macro). Data received as a message is
validated.

- **Serialization of data stored in the blockchain** (the `storage_value!`
  macro). Data obtained from the blockchain is not validated, since it is assumed
  to be validated earlier.

## Motivation of Own Serialization Format

Due to the fact that we do not need to serialize-deserialize the data, we can
work with the signed messages, and later, if necessary, transfer them to other
nodes. This is necessary for the consensus algorithm. Also, "deserialization" of
unused fields does not occur without the need, which minimizes the overhead.
Moreover, this format allows to achieve `zero-copy` because the data itself is a
kind of non-mutable buffer that can be safely transmitted, and there will be no
copying until there is no access to the fields.

## Serialization Principles

## Examples
