import type { Session } from '../types'
import StrengthBody from './session/StrengthBody'
import SwimBody from './session/SwimBody'

interface Props {
  session: Session
  onChange: (s: Session) => void
  onFinish: () => void
  onDiscard: () => void
}

/** Despachador delgado: decide que cuerpo renderizar segun la disciplina de
 *  la sesion activa. El switch exhaustivo (sin `default`) es la compuerta
 *  de compilacion — agregar una disciplina nueva rompe esto en "Function
 *  lacks ending return statement" hasta que se le agrega su rama aca, el
 *  mismo mecanismo que sessionDigest en disciplines.ts. La semana y la fase
 *  de fuerza las resuelve StrengthBody desde el plan del store. */
export default function ActiveSession({ session, onChange, onFinish, onDiscard }: Props) {
  switch (session.kind) {
    case 'strength':
      return <StrengthBody session={session} onChange={onChange} onFinish={onFinish} onDiscard={onDiscard} />
    case 'swim':
      return <SwimBody session={session} onChange={onChange} onFinish={onFinish} onDiscard={onDiscard} />
  }
}
