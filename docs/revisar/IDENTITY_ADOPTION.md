# Identity Adoption

CumpleFactura queda preparado para el login comun, pero no debe bloquear el MVP local-first.

Cuando haya distribucion multiusuario:

- Keycloak gestionado como IdP.
- Tenant por cliente/instalacion.
- Invitaciones para asesores, proveedores o empleados.
- Acciones fiscales sensibles con auditoria y, si aplica, step-up auth.
- Certificados y secretos fuera del repo y fuera de configuracion editable visible.

