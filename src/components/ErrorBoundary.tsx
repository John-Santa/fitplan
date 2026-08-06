import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorScreen } from './ErrorScreen'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** P0-2: limite de errores de React de nivel superior. Sin esto, cualquier
 *  excepcion durante un render (una forma de dato inesperada, un bug de
 *  interfaz) deja una pagina en blanco que, para quien tiene dos meses de
 *  historial de entrenamiento en esta app, se ve identica a una perdida de
 *  datos. Es una clase porque los hooks no pueden implementar
 *  getDerivedStateFromError/componentDidCatch. No depende de la tienda: envuelve
 *  a StoreProvider en main.tsx, asi que atrapa errores incluso si la tienda
 *  todavia no esta lista. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Sin backend ni analitica: la consola es el unico rastro disponible
    // para depurar esto despues.
    console.error('FitPlan: error de render atrapado por el limite de errores.', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          title="Algo salió mal"
          message="FitPlan encontró un error inesperado al mostrar esta pantalla. Tus datos siguen guardados en este dispositivo. Puedes exportar un respaldo ahora y luego recargar la aplicación."
        />
      )
    }
    return this.props.children
  }
}
