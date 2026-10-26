# Revisión independiente — fase 2

2026-10-26. Revisión del diff y archivos nuevos, con reproducción Playwright. Dos incidencias importantes: guardar repetidamente y restaurar un borrador obsoleto tras editar durante la petición; certificado que conservaba su comprobación al cambiar la referencia. Se añadieron regresiones antes de las correcciones, con fallos guardados en los logs RED y repetición GREEN.

La segunda revisión confirmó ambas correcciones y no encontró incidencias importantes adicionales en esos cambios; reejecutó el flujo Playwright sin escribir artefactos. Primera revisión: alcance completo del código de fase 2. Segunda revisión: exclusivamente las correcciones. No ejecutó gate completo ni Windows.

La revisión del delta de CI detectó una espera insuficiente entre vista previa PDF y botón Emitir: el refresco puede seguir en curso. El verificador ahora espera un botón visible y habilitado antes de cada clic. La prueba real Windows sigue pendiente hasta disponer de su resultado remoto.
