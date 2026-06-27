import { Injectable, signal, computed } from '@angular/core';

export type Locale = 'es' | 'en' | 'pt';

const STORAGE_KEY = 'crisismap_locale';

const TRANSLATIONS: Record<Locale, Record<string, string>> = {
  es: {
    'app.title': 'CrisisMap',
    'app.subtitle': 'Mapa colaborativo de emergencias',

    'banner.quake.summary': 'Sismo M 7.5 · 24/06/2026 · Altamira / La Guaira',
    'banner.quake.detail': '+100 edificios caídos · aeropuerto cerrado',
    'banner.dismiss': 'Cerrar',

    'fab.report': 'Reportar',
    'fab.locate': 'Mi ubicación',
    'fab.filters': 'Filtros',
    'fab.legend': 'Leyenda',
    'fab.resources': 'Recursos externos',
    'fab.terms': 'Términos y privacidad',
    'fab.language': 'Idioma',

    'report.title': 'Reportar incidente',
    'report.type': 'Tipo',
    'report.severity': 'Severidad',
    'report.severity.low': 'Baja',
    'report.severity.medium': 'Media',
    'report.severity.high': 'Alta',
    'report.description': 'Descripción (opcional)',
    'report.photos': 'Fotos (opcional, máx. {max})',
    'report.photos.ready': '{n} foto(s) lista(s)',
    'report.submit': 'Enviar',
    'report.submitting': 'Enviando…',
    'report.cancel': 'Cancelar',
    'report.success': 'Reporte creado correctamente',
    'report.savedOffline': 'Reporte guardado sin conexión, se enviará cuando vuelva la red',
    'report.error.generic': 'No se pudo enviar. Guardado sin conexión para reintento.',
    'report.error.upload': 'Reporte guardado, las fotos se subirán luego.',

    'duplicate.title': 'Incidente similar cercano',
    'duplicate.body': 'Ya existe un incidente de este tipo cerca de tu ubicación.',
    'duplicate.confirmExisting': 'Confirmar existente',
    'duplicate.createNew': 'Crear nuevo',

    'filters.title': 'Filtros',
    'filters.apply': 'Aplicar',
    'filters.close': 'Cerrar',
    'filters.confirmedOnly': 'Solo confirmados',

    'legend.title': 'Leyenda',
    'legend.close': 'Cerrar',

    'resources.title': 'Recursos externos',
    'resources.disclaimer': 'Estos enlaces son recursos de <strong>terceros</strong>. CrisisMap solo los comparte como referencia; <strong>no garantiza ni verifica</strong> la exactitud, disponibilidad ni vigencia de su contenido. Úselos bajo su propio criterio.',
    'resources.disclaimer.footer': '¿Tienes un recurso oficial para agregar? Comparte el enlace por los canales habituales. CrisisMap no edita esta lista automáticamente.',
    'resources.close': 'Cerrar',

    'resources.badge.public': 'Drive público',

    'resources.link.drive.title': 'SISMO 2026 VZLA — Drive de hospitales',
    'resources.link.drive.desc': 'Carpetas por hospital, listas de ingresados y reportes de campo (gestionado por terceros).',
    'resources.link.crv.title': 'Cruz Roja Venezolana',
    'resources.link.crv.desc': 'Filiales en todo el país. Búsqueda de personas y atención de emergencias.',
    'resources.link.crv.rcf.title': 'Cruz Roja Venezolana — Búsqueda de personas (RCF)',
    'resources.link.crv.rcf.desc': 'Programa Restablecimiento del Contacto entre Familias. Contacta la filial más cercana.',
    'resources.link.bomberos.title': 'Bomberos del Distrito Capital',
    'resources.link.bomberos.desc': 'Cuerpo de bomberos de Caracas. Emergencias por derrumbe, rescate, incendio.',
    'resources.link.inameh.title': 'INAMEH — Instituto Nacional de Meteorología e Hidrología',
    'resources.link.inameh.desc': 'Pronóstico oficial del clima y alerta de réplicas / lluvia (riesgo de deslaves).',
    'resources.link.usgs.title': 'USGS — Detalle del evento sísmico',
    'resources.link.usgs.desc': 'Información técnica oficial del terremoto M 7.5 del 24/06/2026 (USGS Earthquake Hazards Program).',

    'terms.title': 'Términos y Política de Privacidad',
    'terms.firstLaunch': 'CrisisMap es una iniciativa comunitaria gratuita creada para ayudar a comunidades durante desastres mediante reportes colaborativos. La información es aportada por voluntarios y puede ser inexacta, incompleta o desactualizada. CrisisMap no es un servicio oficial de emergencias y no debe reemplazar a las autoridades. El uso de esta plataforma es enteramente voluntario y bajo su propio riesgo.',
    'terms.consent': 'He leído y acepto los Términos y la Política de Privacidad',
    'terms.accept': 'Aceptar y continuar',
    'terms.decline': 'No acepto, salir',

    'incident.title': 'Detalles del reporte',
    'incident.confirm': 'Confirmar',
    'incident.improved': 'Mejoró',
    'incident.worsened': 'Empeoró',
    'incident.gone': 'Ya no existe',
    'incident.alreadyVerified': 'Este dispositivo ya verificó este incidente.',
    'incident.close': 'Cerrar',
    'incident.confirmedBy': 'Confirmado por {n} personas',

    'contact.title': 'Contactar al equipo',
    'contact.subject': 'Asunto',
    'contact.message': 'Mensaje',
    'contact.message.placeholder': 'Describe tu pregunta, reporte o problema...',
    'contact.send': 'Abrir en app de correo',
    'contact.cancel': 'Cancelar',
    'contact.preview': 'Esto abrirá tu app de correo con un mensaje pre-llenado a {email}.',
    'contact.close': 'Cerrar',

    'contact.subject.bug': 'Reportar un error / problema técnico',
    'contact.subject.safety': 'Reportar uso inapropiado / abuso',
    'contact.subject.coordinate': 'Coordinar ayuda en zona',
    'contact.subject.press': 'Prensa / medios',
    'contact.subject.other': 'Otro asunto',

    'lang.es': 'Español',
    'lang.en': 'English',
    'lang.pt': 'Português',

    'common.cancel': 'Cancelar',
    'common.close': 'Cerrar',
    'common.error': 'Error',

    'cat.emergency': 'Emergencia',
    'cat.infrastructure': 'Daño a infraestructura',
    'cat.service_interruption': 'Interrupción de servicio',
    'cat.resource': 'Recurso disponible',
    'cat.communications': 'Comunicaciones',

    'type.people_trapped': 'Personas atrapadas',
    'type.building_collapse': 'Edificio colapsado',
    'type.damaged_building': 'Edificio dañado',
    'type.fire': 'Incendio',
    'type.flood': 'Inundación',
    'type.road_blocked': 'Vía bloqueada',
    'type.bridge_damaged': 'Puente dañado',
    'type.landslide': 'Deslave',
    'type.gas_leak': 'Fuga de gas',
    'type.hospital': 'Hospital',
    'type.shelter': 'Refugio',
    'type.food': 'Comida',
    'type.water': 'Agua',
    'type.medicine': 'Medicinas',
    'type.electricity': 'Electricidad',
    'type.fuel': 'Combustible',
    'type.internet': 'Internet',
    'type.starlink': 'Starlink',
    'type.open_wifi': 'WiFi abierto',
    'type.charging_point': 'Punto de carga',
    'type.other': 'Otro',
  },

  en: {
    'app.title': 'CrisisMap',
    'app.subtitle': 'Collaborative emergency map',

    'banner.quake.summary': 'M 7.5 quake · 24/06/2026 · Altamira / La Guaira',
    'banner.quake.detail': '+100 buildings down · airport closed',
    'banner.dismiss': 'Dismiss',

    'fab.report': 'Report',
    'fab.locate': 'My location',
    'fab.filters': 'Filters',
    'fab.legend': 'Legend',
    'fab.resources': 'External resources',
    'fab.terms': 'Terms & privacy',
    'fab.language': 'Language',

    'report.title': 'Report incident',
    'report.type': 'Type',
    'report.severity': 'Severity',
    'report.severity.low': 'Low',
    'report.severity.medium': 'Medium',
    'report.severity.high': 'High',
    'report.description': 'Description (optional)',
    'report.photos': 'Photos (optional, max {max})',
    'report.photos.ready': '{n} photo(s) ready',
    'report.submit': 'Submit',
    'report.submitting': 'Sending…',
    'report.cancel': 'Cancel',
    'report.success': 'Report submitted',
    'report.savedOffline': 'Report saved offline, will sync when connection returns',
    'report.error.generic': 'Could not submit. Saved offline for retry.',
    'report.error.upload': 'Report saved, photos will retry later.',

    'duplicate.title': 'Similar incident nearby',
    'duplicate.body': 'An incident of this type already exists near your location.',
    'duplicate.confirmExisting': 'Confirm existing',
    'duplicate.createNew': 'Create new',

    'filters.title': 'Filters',
    'filters.apply': 'Apply',
    'filters.close': 'Close',
    'filters.confirmedOnly': 'Confirmed only',

    'legend.title': 'Legend',
    'legend.close': 'Close',

    'resources.title': 'External resources',
    'resources.disclaimer': 'These links are <strong>third-party</strong> resources. CrisisMap shares them as references only; <strong>it does not guarantee or verify</strong> their accuracy, availability, or timeliness. Use them at your own discretion.',
    'resources.disclaimer.footer': 'Have an official resource to add? Share the link through the usual channels. CrisisMap does not edit this list automatically.',
    'resources.close': 'Close',

    'resources.badge.public': 'Public Drive',

    'resources.link.drive.title': 'SISMO 2026 VZLA — Hospital drive',
    'resources.link.drive.desc': 'Folders per hospital, inpatient lists, and field reports (third-party managed).',
    'resources.link.crv.title': 'Venezuelan Red Cross',
    'resources.link.crv.desc': 'Branches nationwide. Search for missing persons and emergency response.',
    'resources.link.crv.rcf.title': 'Venezuelan Red Cross — Missing persons (RCF)',
    'resources.link.crv.rcf.desc': 'Restoring Family Links program. Contact your nearest branch.',
    'resources.link.bomberos.title': 'Caracas Fire Department',
    'resources.link.bomberos.desc': 'Caracas fire & rescue. Building collapse, rescue, fire emergencies.',
    'resources.link.inameh.title': 'INAMEH — National Weather & Hydrology Institute',
    'resources.link.inameh.desc': 'Official weather forecast and aftershock / rainfall (landslide risk) alerts.',
    'resources.link.usgs.title': 'USGS — Earthquake event detail',
    'resources.link.usgs.desc': 'Official technical info on the M 7.5 earthquake of 24/06/2026 (USGS Earthquake Hazards Program).',

    'terms.title': 'Terms of Service & Privacy Policy',
    'terms.firstLaunch': 'CrisisMap is a free community initiative created to help communities during disasters through collaborative reporting. Information is contributed by volunteers and may be inaccurate, incomplete, or outdated. CrisisMap is not an official emergency service and must never replace emergency authorities. Use of this platform is entirely voluntary and at your own risk.',
    'terms.consent': 'I have read and accept the Terms and Privacy Policy',
    'terms.accept': 'Accept and continue',
    'terms.decline': 'Decline, exit',

    'incident.title': 'Report details',
    'incident.confirm': 'Confirm',
    'incident.improved': 'Improved',
    'incident.worsened': 'Worsened',
    'incident.gone': 'No longer exists',
    'incident.alreadyVerified': 'This device has already verified this incident.',
    'incident.close': 'Close',
    'incident.confirmedBy': 'Confirmed by {n} people',

    'contact.title': 'Contact the team',
    'contact.subject': 'Subject',
    'contact.message': 'Message',
    'contact.message.placeholder': 'Describe your question, report, or issue...',
    'contact.send': 'Open in mail app',
    'contact.cancel': 'Cancel',
    'contact.preview': 'This will open your mail app with a pre-filled message to {email}.',
    'contact.close': 'Close',

    'contact.subject.bug': 'Report a bug / technical issue',
    'contact.subject.safety': 'Report misuse / abuse',
    'contact.subject.coordinate': 'Coordinate aid in an area',
    'contact.subject.press': 'Press / media',
    'contact.subject.other': 'Other',

    'lang.es': 'Español',
    'lang.en': 'English',
    'lang.pt': 'Português',

    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.error': 'Error',

    'cat.emergency': 'Emergency',
    'cat.infrastructure': 'Infrastructure damage',
    'cat.service_interruption': 'Service interruption',
    'cat.resource': 'Available resource',
    'cat.communications': 'Communications',

    'type.people_trapped': 'People trapped',
    'type.building_collapse': 'Building collapse',
    'type.damaged_building': 'Damaged building',
    'type.fire': 'Fire',
    'type.flood': 'Flood',
    'type.road_blocked': 'Road blocked',
    'type.bridge_damaged': 'Bridge damaged',
    'type.landslide': 'Landslide',
    'type.gas_leak': 'Gas leak',
    'type.hospital': 'Hospital',
    'type.shelter': 'Shelter',
    'type.food': 'Food',
    'type.water': 'Water',
    'type.medicine': 'Medicine',
    'type.electricity': 'Electricity',
    'type.fuel': 'Fuel',
    'type.internet': 'Internet',
    'type.starlink': 'Starlink',
    'type.open_wifi': 'Open WiFi',
    'type.charging_point': 'Charging point',
    'type.other': 'Other',
  },

  pt: {
    'app.title': 'CrisisMap',
    'app.subtitle': 'Mapa colaborativo de emergências',

    'banner.quake.summary': 'Sismo M 7.5 · 24/06/2026 · Altamira / La Guaira',
    'banner.quake.detail': '+100 prédios caídos · aeroporto fechado',
    'banner.dismiss': 'Fechar',

    'fab.report': 'Reportar',
    'fab.locate': 'Minha localização',
    'fab.filters': 'Filtros',
    'fab.legend': 'Legenda',
    'fab.resources': 'Recursos externos',
    'fab.terms': 'Termos e privacidade',
    'fab.language': 'Idioma',

    'report.title': 'Reportar incidente',
    'report.type': 'Tipo',
    'report.severity': 'Severidade',
    'report.severity.low': 'Baixa',
    'report.severity.medium': 'Média',
    'report.severity.high': 'Alta',
    'report.description': 'Descrição (opcional)',
    'report.photos': 'Fotos (opcional, máx. {max})',
    'report.photos.ready': '{n} foto(s) pronta(s)',
    'report.submit': 'Enviar',
    'report.submitting': 'Enviando…',
    'report.cancel': 'Cancelar',
    'report.success': 'Reporte enviado',
    'report.savedOffline': 'Reporte salvo sem conexão, será enviado quando voltar a rede',
    'report.error.generic': 'Não foi possível enviar. Salvo sem conexão para reenviar.',
    'report.error.upload': 'Reporte salvo, as fotos serão reenviadas depois.',

    'duplicate.title': 'Incidente semelhante próximo',
    'duplicate.body': 'Já existe um incidente deste tipo perto da sua localização.',
    'duplicate.confirmExisting': 'Confirmar existente',
    'duplicate.createNew': 'Criar novo',

    'filters.title': 'Filtros',
    'filters.apply': 'Aplicar',
    'filters.close': 'Fechar',
    'filters.confirmedOnly': 'Somente confirmados',

    'legend.title': 'Legenda',
    'legend.close': 'Fechar',

    'resources.title': 'Recursos externos',
    'resources.disclaimer': 'Estes links são recursos de <strong>terceiros</strong>. CrisisMap os compartilha apenas como referência; <strong>não garante nem verifica</strong> a exatidão, disponibilidade ou atualidade do conteúdo. Use-os por sua conta e risco.',
    'resources.disclaimer.footer': 'Tem um recurso oficial para adicionar? Compartilhe o link pelos canais habituais. CrisisMap não edita esta lista automaticamente.',
    'resources.close': 'Fechar',

    'resources.badge.public': 'Drive público',

    'resources.link.drive.title': 'SISMO 2026 VZLA — Drive de hospitais',
    'resources.link.drive.desc': 'Pastas por hospital, listas de internados e reportes de campo (gerenciado por terceiros).',
    'resources.link.crv.title': 'Cruz Vermelha Venezuelana',
    'resources.link.crv.desc': 'Filiais em todo o país. Busca de pessoas e atendimento de emergências.',
    'resources.link.crv.rcf.title': 'Cruz Vermelha Venezuelana — Busca de pessoas (RCF)',
    'resources.link.crv.rcf.desc': 'Programa Restabelecimento de Laços Familiares. Contate a filial mais próxima.',
    'resources.link.bomberos.title': 'Bombeiros do Distrito Capital',
    'resources.link.bomberos.desc': 'Corpo de bombeiros de Caracas. Emergências por desabamento, resgate, incêndio.',
    'resources.link.inameh.title': 'INAMEH — Instituto Nacional de Meteorologia e Hidrologia',
    'resources.link.inameh.desc': 'Previsão oficial do clima e alertas de réplicas / chuva (risco de deslizamentos).',
    'resources.link.usgs.title': 'USGS — Detalhe do evento sísmico',
    'resources.link.usgs.desc': 'Informação técnica oficial do terremoto M 7.5 de 24/06/2026 (USGS Earthquake Hazards Program).',

    'terms.title': 'Termos de Serviço e Política de Privacidade',
    'terms.firstLaunch': 'CrisisMap é uma iniciativa comunitária gratuita criada para ajudar comunidades durante desastres por meio de reportes colaborativos. A informação é fornecida por voluntários e pode ser imprecisa, incompleta ou desatualizada. CrisisMap não é um serviço oficial de emergências e nunca deve substituir as autoridades. O uso desta plataforma é inteiramente voluntário e por sua conta e risco.',
    'terms.consent': 'Li e aceito os Termos e a Política de Privacidade',
    'terms.accept': 'Aceitar e continuar',
    'terms.decline': 'Não aceito, sair',

    'incident.title': 'Detalhes do reporte',
    'incident.confirm': 'Confirmar',
    'incident.improved': 'Melhorou',
    'incident.worsened': 'Piorou',
    'incident.gone': 'Não existe mais',
    'incident.alreadyVerified': 'Este dispositivo já verificou este incidente.',
    'incident.close': 'Fechar',
    'incident.confirmedBy': 'Confirmado por {n} pessoas',

    'contact.title': 'Falar com a equipa',
    'contact.subject': 'Assunto',
    'contact.message': 'Mensagem',
    'contact.message.placeholder': 'Descreva sua pergunta, reporte ou problema...',
    'contact.send': 'Abrir no app de e-mail',
    'contact.cancel': 'Cancelar',
    'contact.preview': 'Isto abrirá o seu app de e-mail com uma mensagem pré-preenchida para {email}.',
    'contact.close': 'Fechar',

    'contact.subject.bug': 'Reportar um erro / problema técnico',
    'contact.subject.safety': 'Reportar uso indevido / abuso',
    'contact.subject.coordinate': 'Coordenar ajuda numa zona',
    'contact.subject.press': 'Imprensa / mídia',
    'contact.subject.other': 'Outro assunto',

    'lang.es': 'Español',
    'lang.en': 'English',
    'lang.pt': 'Português',

    'common.cancel': 'Cancelar',
    'common.close': 'Fechar',
    'common.error': 'Erro',

    'cat.emergency': 'Emergência',
    'cat.infrastructure': 'Dano a infraestrutura',
    'cat.service_interruption': 'Interrupção de serviço',
    'cat.resource': 'Recurso disponível',
    'cat.communications': 'Comunicações',

    'type.people_trapped': 'Pessoas presas',
    'type.building_collapse': 'Prédio desabado',
    'type.damaged_building': 'Prédio danificado',
    'type.fire': 'Incêndio',
    'type.flood': 'Inundação',
    'type.road_blocked': 'Via bloqueada',
    'type.bridge_damaged': 'Ponte danificada',
    'type.landslide': 'Deslizamento',
    'type.gas_leak': 'Vazamento de gás',
    'type.hospital': 'Hospital',
    'type.shelter': 'Abrigo',
    'type.food': 'Comida',
    'type.water': 'Água',
    'type.medicine': 'Medicamentos',
    'type.electricity': 'Eletricidade',
    'type.fuel': 'Combustível',
    'type.internet': 'Internet',
    'type.starlink': 'Starlink',
    'type.open_wifi': 'WiFi aberto',
    'type.charging_point': 'Ponto de carga',
    'type.other': 'Outro',
  },
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly locale = signal<Locale>(this.detectInitial());
  readonly available: Locale[] = ['es', 'en', 'pt'];

  readonly isEs = computed(() => this.locale() === 'es');
  readonly isEn = computed(() => this.locale() === 'en');
  readonly isPt = computed(() => this.locale() === 'pt');

  private detectInitial(): Locale {
    if (typeof localStorage === 'undefined') return 'es';
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored && ['es', 'en', 'pt'].includes(stored)) return stored;
    const nav = typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2).toLowerCase() : '';
    if (nav === 'en') return 'en';
    if (nav === 'pt') return 'pt';
    return 'es';
  }

  setLocale(l: Locale): void {
    this.locale.set(l);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, l);
    }
  }

  t(key: string, params?: Record<string, string | number>): string {
    const dict = TRANSLATIONS[this.locale()] ?? TRANSLATIONS.es;
    let value = dict[key] ?? TRANSLATIONS.es[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replaceAll(`{${k}}`, String(v));
      }
    }
    return value;
  }
}