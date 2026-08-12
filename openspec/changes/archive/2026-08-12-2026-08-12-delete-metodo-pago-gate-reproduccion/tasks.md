## Tasks

- [x] `DELETE /metodos-pago/{id}` (backend): ownership vía `metodo_pago_existe`, 409 si cubre el
      período vigente de una suscripción, auditoría `eliminacion_metodo_pago`.
- [x] Botón de eliminar + confirmación en `FacturacionPage.tsx`.
- [x] `radio_por_track` exige `get_current_user`; confirmado que `mix_diario` ya exigía
      `require_b2c_user`.
- [x] Gate de sesión en `PlayerContext.play()` (corta antes de cualquier red, sin fallback
      simulado) y en `useRadio.iniciarRadio`.
- [x] Enlace "explorar catálogo sin cuenta" en `LoginPage`.
- [x] Verificar con `curl` real: crear → listar → eliminar → listar (método ya no aparece); 404 al
      eliminar un id inexistente o de otro usuario; 401 en `radio/track` y `mix-diario` sin token;
      200 en `radio/track` con token (regresión).
- [x] `npm run build` sin errores.
- [ ] Playwright del botón eliminar y del aviso de "inicia sesión" al intentar reproducir sin
      cuenta (no ejecutado por límite de tiempo pre-demo).
