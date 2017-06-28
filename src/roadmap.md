# Exonum Roadmap

Exonum is an open source software, so there is no particular concept of
“Exonum core developers” (see [contributing guide](contributing.md)). However,
there're preferred directions of the development. These include maintainers
opinions, natural improvements and a will to correspond to good practices.

## Overall Direction

Currently Exonum is a
[*framework*](https://en.wikipedia.org/wiki/Software_framework). This means
that in order to run a specific Exonum-based application, one needs to develop
this application with the aid of Exonums' public API. This approach is similar
to using [third parties
libraries](https://en.wikipedia.org/wiki/Third-party_software_component).
Typical workflow in this case is as follows:

- Download the source code of Exonum Core and additional modules
- Implement the logic of interaction with blockchain and other functionality
- Build the application
- Deploy it on the necessary hardware infrastructure

For the convenience, we want to make Exonum a *standalone application*. Thus,
after downloading and building Exonum (or even downloading a pre-built
version), one can deploy the 'clean solution' at once. Afterwards it can be
extended with additional modules, possibly, custom-built directly for the
purpose of the specific project.

!!! note
    This automatically means that [services](../architecture/services.md) will
    become similar to [shared
    libraries](https://en.wikipedia.org/wiki/Library_(computing)#Shared_libraries)
    (`.dll` in Windows or `.so` in Unix-based systems). So Exonum will support
    '**dynamically added smart-contracts**', which are known in other blockchain
    systems (see
    [Ethereum](http://www.ethdocs.org/en/latest/contracts-and-transactions/contracts.html))

Lifecycle for a service in Exonum would look like as the following:

- The service is uploaded as a shared library within a specific transaction in
Exonum blockchain
- [Validators](../advanced/consensus/consensus/#assumptions) make a decision on
inclusion of a service into active
[configuration](../architecture/configuration)
- A service becomes active, that is available for users of the system
- If necessary services can be removed by the
[consensus](../advanced/consensus/consensus.md) of validators

## Interoperability

## Java Binding

## Object Related Mapping
