/** El aviso de "versión nueva" nunca aparece con un entrenamiento en curso:
 *  recargar a mitad de una serie es justo lo que hay que evitar. Se muestra
 *  cuando la sesión activa termina. */
export const showUpdatePrompt = (needRefresh: boolean, workoutActive: boolean) => needRefresh && !workoutActive
