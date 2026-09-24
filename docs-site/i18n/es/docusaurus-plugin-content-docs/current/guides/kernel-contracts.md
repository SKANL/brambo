---
title: Contratos de ejecución del kernel
audience: Developers and maintainers
prerequisites: Node.js >=20 y TypeScript
outcome: Implementar un executor, una policy de permisos, un audit sink o un replay store seguro
scope: Lifecycle, autorización, replay y extensiones del micro-kernel
compatibility: Published packages support Node.js >=20
translationStatus: translated
---
# Kernel execution contracts

El kernel de Brambo es el límite de ejecución independiente del protocolo. Es
responsable del lifecycle y de las decisiones de autorización; no es responsable
del transporte, registro de providers, base de datos ni interfaz de usuario.

## Guarantees

- Una sesión empieza en `created`, sólo acepta trabajo después de `active` y
  llega a `completed`, `failed` o `closed` mediante transiciones tipadas.
- Los turns son FIFO y secuenciales en v1: como máximo uno está `running` por
  sesión. Un turn cancelado o fallido nunca se convierte en `completed`.
- La afinidad del executor es explícita. Un fallo del executor falla la sesión;
  v1 no cambia silenciosamente a otro executor.
- Los scopes de permisos son discriminados: `action`, `session` y `workspace`.
  Un deny explícito vence a cualquier allow, y un allow más específico vence a
  uno más amplio.
- La expiración se verifica con el reloj inyectado. Los timers sólo aceleran la
  notificación; revocar tiene efecto inmediato.
- La policy automática es opcional y fail-closed. Un fallo de policy o de
  persistencia de auditoría no puede convertirse en un allow implícito.
- El replay devuelve `overflow` cuando el cursor pedido ya no está retenido.
- La admisión detecta duplicados y conflictos de payload. Un receipt prueba
  identidad de admisión, no persistencia del resultado.

## Non-guarantees and deferred behavior

El kernel no ofrece turns concurrentes, prioridades, failover, almacenamiento
persistente de receipts/resultados, event store distribuido, transporte remoto,
UI de permisos ni policy específica de vendors.

`EventBus` notifica en vivo. El event log de sesión conserva historial/replay.
`LogSink` y `PermissionAuditSink` son canales de diagnóstico/auditoría. Emitir en
uno no implica persistir en otro.

El kernel tampoco afirma aislamiento del sistema operativo. La sandbox policy
restringe lo que puede hacer un proceso; la permission policy decide si una
acción está autorizada. Deben mantenerse separadas.

## Implementing an executor

El host compone un executor con `runSession` y mantiene una afinidad estable.

## Implementing a permission policy

Una policy debe ser determinista y fail-closed.

## Implementing an audit sink

El sink recibe metadata tipada y redactada; no recibe secretos.

## Implementing a replay store

Un store externo conserva cursores monotónicos y reporta overflow explícito.

Un executor debe procesar un turn a la vez, observar cancelación, informar fallos
como errores y liberar sus recursos. La selección de proceso o vendor pertenece
al host.

Una `PermissionDecisionPolicy` debe ser determinista y sin efectos laterales.
Debe devolver `allow`, `deny` o `ask`, incluir una razón estructurada y fallar
cerrando cuando un servicio externo no esté disponible.

Un `PermissionAuditSink` recibe metadata tipada y redactada: IDs, scope, action,
source, reason y timestamps, pero no prompts completos, argumentos, credenciales
ni mapas de entorno. Si falla al guardar un approval, el authorizer devuelve un
deny del sistema.

Un replay store durable externo debe conservar cursores monotónicos, ordering,
`readAfter(cursor)` y un resultado explícito de overflow. No debe fabricar
historial faltante.

## Contract-test checklist

Antes de publicar una integración, cubrí:

- transiciones inválidas y turns secuenciales;
- cancelación en cola y durante ejecución;
- fallos del executor y cierre acotado;
- scopes, precedencia, expiración, revocación y policy automática;
- auditoría de approval, denial, expiración y revocación;
- replay, overflow y admisión duplicate/conflict;
- cierre con trabajo o permisos pendientes.

Los helpers deterministas de `packages/kernel/test/contract-kit.ts` ofrecen reloj
y timer manuales, colector de auditoría, factory de policy, fake de executor y
factory de replay store.
