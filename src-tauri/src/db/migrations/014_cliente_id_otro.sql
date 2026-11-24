-- N2: cliente extranjero. Clave L7 de `IDOtro/IDType` (02 NIF-IVA … 07 No censado).
-- NULL = NIF español (los clientes que ya existen siguen igual).
ALTER TABLE customers ADD COLUMN id_type TEXT;
