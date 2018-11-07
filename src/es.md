# Exonum

**Exonum** es un marco extensible de código abierto para crear aplicaciones
blockchain. Exonum se puede usar para crear ledgers distribuidos suministrados
criptográficamente en prácticamente cualquier dominio problemático,
incluyendo FinTech, GovTech y LegalTech. El esquema de Exonum está enfocado
hacia la creación de blockchains permitidos, es decir, blockchains con la
infraestructura de proveedores conocidos de blockchain.

Exonum usa [el lenguaje de programación Rust][rust] para lograr la máxima
seguridad durante la ejecución;
[una estructura centrada en los servicios][wiki:soa] para proporcionar
extensibilidad, flexibilidad y modularidad; y una verificación por parte
del cliente basada en los [compromisos criptográficos][wiki:commitment]
(Merkle y Merkle Patricia) para garantizar la transparencia del sistema
y la seguridad del cliente.

## Inicio

### Instalación

[Exonum][core] es una biblioteca de código abierto de Rust que ofrece la
funcionalidad principal al marco Exonum. Está disponible bajo una
[licencia Apache 2.0][apache].
Puede consultar la [guía de instalación](get-started/install.md) para instalar
la biblioteca junto con sus requisitos previos.

### Tutorial de criptomonedas

El [tutorial de criptomonedas](get-started/create-service.md) muestra cómo se
puede usar Exonum para crear fácilmente y paso a paso una aplicación basada en
las criptomonedas. Además del núcleo de Exonum, el tutorial también usa el
[Light Client][client], una biblioteca de JavaScript para que el cliente
verifique la información del blockchain y sepa cómo se ejecutan las
operaciones criptográficas (como la firma digital).

El código de la fuente del tutorial está disponible en [GitHub][tutorial].

## En profundidad

### Diseño del marco y motivaciones

Consulte [*qué es Exonum*](get-started/what-is-exonum.md) para conocer las
motivaciones que hay detrás del desarrollo de otro marco de blockchain
autorizado. La
[*descripción general del diseño*](get-started/design-overview.md)
ofrece un enfoque más técnico e incluye una descripción más detallada del
diseño de Exonum.

### Servicios y clientes

Los 2 tópicos siguientes ofrecen una información muy valiosa de cómo mejorar
con Exonum:

- [*Los servicios*](architecture/services.md) son el bloque de construcción
  principal de la arquitectura de Exonum.
- [*Light client*](architecture/clients.md)
  es la manera principal que tienen las aplicaciones de terceros para
  interactuar con los servicios.

!!! tip "Consejo"
    Diríjase a los servicios de [afianzamiento][anchoring] y actualizaciónde
    las [configuraciones][config] para ver ejemplos reales de los
    servicios de Exonum.

### Especificaciones

La documentación de Exonum contiene información detallada de muchos otros
aspectos del marco como la
[serialización binaria](architecture/serialization.md),
el [almacenamiento](architecture/storage.md)
y el [networking](advanced/network.md).

## Contribución

Diríjase a la [guía de contribución](contributing.md) para obtener información
de cómo contribuir al desarrollo de Exonum y la guía
[para conocer las características](roadmap.md) que están por llegar.

[rust]: http://rust-lang.org/
[wiki:soa]: https://en.wikipedia.org/wiki/Service-oriented_architecture
[wiki:commitment]: https://en.wikipedia.org/wiki/Commitment_scheme
[core]: http://github.com/exonum/exonum/
[apache]: https://opensource.org/licenses/Apache-2.0
[client]: https://github.com/exonum/exonum-client
[tutorial]: https://github.com/exonum/exonum/blob/master/examples/demo-service
[anchoring]: https://github.com/exonum/exonum-btc-anchoring/
[config]: https://github.com/exonum/exonum/tree/master/services/configuration
