// Rubros: la misma app con las palabras, servicios y productos de cada tipo de
// negocio. Agregar un rubro = agregar una entrada aquí.

export const VERTICALS = {
  barberia: {
    label: 'Barbería',
    terms: {
      staff: 'barbero', Staff: 'Barbero', staffs: 'barberos', Staffs: 'Barberos',
      biz: 'barbería', Biz: 'Barbería', rebook: 'Te toca corte', rebookNext: 'ya va siendo hora del próximo corte',
      planLabel: 'Barbería', staffHint: 'Degradados, barba…',
    },
    services: [
      ['Corte clásico', 'Cortes', 30, 10000], ['Degradado (fade)', 'Cortes', 40, 12000], ['Corte + barba', 'Combos', 60, 18000],
      ['Perfilado de barba', 'Barba', 20, 7000], ['Afeitado con toalla caliente', 'Barba', 30, 9000],
      ['Corte niño (hasta 12)', 'Cortes', 30, 8000], ['Cejas', 'Extras', 10, 3000],
    ],
    staff: [['Matías Rojas', 'Degradados y diseños'], ['Camila Soto', 'Cortes clásicos y barba'], ['Diego Fuentes', 'Afeitado tradicional']],
    products: [['Cera mate', 'CER-01', 9000, 4000, 12], ['Aceite para barba', 'ACE-01', 11000, 5000, 6], ['Pomada brillo', 'POM-01', 9500, 4200, 2], ['Shampoo anticaspa', 'SHA-01', 8000, 3500, 9]],
  },
  peluqueria: {
    label: 'Peluquería / salón de belleza',
    terms: {
      staff: 'estilista', Staff: 'Estilista', staffs: 'estilistas', Staffs: 'Estilistas',
      biz: 'salón', Biz: 'Salón', rebook: 'Te toca volver', rebookNext: 'ya es buen momento para tu próxima visita al salón',
      planLabel: 'Salón', staffHint: 'Color, cortes, peinados…',
    },
    services: [
      ['Corte de pelo', 'Cortes', 45, 15000], ['Lavado y brushing', 'Peinados', 40, 12000], ['Color raíz', 'Color', 90, 30000],
      ['Mechas / balayage', 'Color', 180, 65000], ['Tratamiento hidratante', 'Tratamientos', 45, 18000], ['Peinado para evento', 'Peinados', 60, 25000],
    ],
    staff: [['Valentina Ríos', 'Colorista'], ['Javiera Muñoz', 'Cortes y peinados'], ['Andrés Lagos', 'Balayage']],
    products: [['Shampoo reparador', 'SHA-01', 14000, 6000, 10], ['Acondicionador', 'ACO-01', 14000, 6000, 8], ['Sérum de puntas', 'SER-01', 16000, 7000, 2], ['Protector térmico', 'PRT-01', 12000, 5000, 6]],
  },
  unas: {
    label: 'Uñas, pestañas y cejas',
    terms: {
      staff: 'profesional', Staff: 'Profesional', staffs: 'profesionales', Staffs: 'Profesionales',
      biz: 'estudio', Biz: 'Estudio', rebook: 'Te toca retoque', rebookNext: 'ya es momento de tu retoque',
      planLabel: 'Estudio', staffHint: 'Uñas acrílicas, lifting…',
    },
    services: [
      ['Manicure tradicional', 'Manos', 40, 10000], ['Esmaltado permanente', 'Manos', 60, 15000], ['Uñas acrílicas', 'Manos', 120, 28000],
      ['Pedicure', 'Pies', 60, 16000], ['Lifting de pestañas', 'Pestañas', 60, 22000], ['Diseño de cejas', 'Cejas', 30, 9000],
    ],
    staff: [['Fernanda Paz', 'Uñas acrílicas'], ['Daniela Cruz', 'Pestañas y cejas'], ['Catalina Mora', 'Manicure y pedicure']],
    products: [['Aceite de cutícula', 'CUT-01', 6000, 2500, 12], ['Crema de manos', 'CRE-01', 8000, 3500, 6], ['Sérum de pestañas', 'PES-01', 18000, 8000, 2]],
  },
  tatuajes: {
    label: 'Tatuajes y piercing',
    terms: {
      staff: 'artista', Staff: 'Artista', staffs: 'artistas', Staffs: 'Artistas',
      biz: 'estudio', Biz: 'Estudio', rebook: 'Te esperamos de vuelta', rebookNext: 'si quieres retocar o hacerte uno nuevo, tenemos horas',
      planLabel: 'Estudio', staffHint: 'Realismo, línea fina…',
    },
    services: [
      ['Evaluación y diseño', 'Consultas', 30, 0], ['Tatuaje pequeño', 'Tatuajes', 60, 40000], ['Tatuaje mediano', 'Tatuajes', 180, 120000],
      ['Sesión completa', 'Tatuajes', 360, 250000], ['Retoque', 'Tatuajes', 60, 20000], ['Piercing', 'Piercing', 30, 25000],
    ],
    staff: [['Nicolás Vera', 'Realismo'], ['Antonia Leiva', 'Línea fina'], ['Bruno Salas', 'Tradicional']],
    products: [['Crema de cuidado', 'CUI-01', 9000, 4000, 15], ['Film protector', 'FIL-01', 5000, 2000, 20], ['Joya de titanio', 'JOY-01', 15000, 6000, 3]],
  },
  masajes: {
    label: 'Masajes y spa',
    terms: {
      staff: 'terapeuta', Staff: 'Terapeuta', staffs: 'terapeutas', Staffs: 'Terapeutas',
      biz: 'centro', Biz: 'Centro', rebook: 'Te toca relajarte', rebookNext: 'ya es buen momento para tu próximo masaje',
      planLabel: 'Centro', staffHint: 'Descontracturante, piedras…',
    },
    services: [
      ['Masaje descontracturante', 'Masajes', 60, 30000], ['Masaje relajante', 'Masajes', 60, 28000], ['Piedras calientes', 'Masajes', 75, 35000],
      ['Drenaje linfático', 'Tratamientos', 60, 30000], ['Limpieza facial', 'Faciales', 60, 32000], ['Reflexología', 'Masajes', 45, 22000],
    ],
    staff: [['Paula Herrera', 'Descontracturante'], ['Ignacio Bravo', 'Deportivo'], ['Sofía Campos', 'Faciales']],
    products: [['Aceite esencial', 'ACE-01', 12000, 5000, 10], ['Crema corporal', 'CRE-01', 15000, 6000, 6], ['Vela aromática', 'VEL-01', 9000, 3500, 2]],
  },
};

export const verticalOf = (b) => VERTICALS[b?.vertical] || VERTICALS.barberia;
export const termsOf = (b) => verticalOf(b).terms;
export const VERTICAL_OPTIONS = Object.entries(VERTICALS).map(([id, v]) => ({ id, label: v.label }));
