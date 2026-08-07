import type { Session } from '../types'
import StrengthBody from './session/StrengthBody'
import SwimBody from './session/SwimBody'

interface Props {
  session: Session
  /** Solo lo usa StrengthBody (ajuste de series segun la semana del bloque).
   *  SwimBody lo ignora: los bloques de natacion no tienen un objetivo fijo
   *  (ver A4 en el plan). */
  setsDelta: number
  onChange: (s: Session) => void
  onFinish: () => void
  onDiscard: () => void
}

/** Despachador delgado: decide que cuerpo renderizar segun la disciplina de
 *  la sesion activa. El switch exhaustivo (sin `default`) es la compuerta
 *  de compilacion — agregar una disciplina nueva rompe esto en "Function
 *  lacks ending return statement" hasta que se le agrega su rama aca, el
 *  mismo mecanismo que sessionDigest en disciplines.ts. */
export default function ActiveSession({ session, setsDelta, onChange, onFinish, onDiscard }: Props) {
  switch (session.kind) {
    case 'strength':
      return <StrengthBody session={session} setsDelta={setsDelta} onChange={onChange} onFinish={onFinish} onDiscard={onDiscard} />
    case 'swim':
      return <SwimBody session={session} onChange={onChange} onFinish={onFinish} onDiscard={onDiscard} />
  }
}
