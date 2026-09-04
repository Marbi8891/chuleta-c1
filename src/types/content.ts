// src/types/content.ts
//
// Tipos compartidos por los tres bancos de contenido. Los valores reales
// observados en los datos migrados (25 temas, bloques I-IV) son un
// subconjunto de BloqueId: BLOQUE_ORDER en la app legacy declaraba
// ["I","II","III","IV","V","VI"], pero solo I-IV tienen contenido cargado
// hoy. Se tipa con el conjunto completo para no romper cuando se añadan
// V y VI.

export type BloqueId = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';

/** Ej: "T01", "T02", ... — cadena de 2 dígitos con prefijo T, tal cual en origen. */
export type TemaCode = string;

/** Ej: "I-T01" — identificador compuesto bloque-tema usado como clave primaria de tema en toda la app. */
export type TemaId = string;
