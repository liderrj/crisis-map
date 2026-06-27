import { Component, output, signal, inject } from '@angular/core';
import { I18nService } from '../core/i18n.service';

const STORAGE_KEY = 'crisismap_terms_v1';

@Component({
  selector: 'app-terms',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="cm-backdrop" role="dialog" aria-modal="true" aria-labelledby="terms-title">
        <div class="cm-terms">
          <header>
            <h2 id="terms-title">{{ i18n.t('terms.title') }}</h2>
          </header>

          <div class="cm-body">
            <section class="cm-first-launch">
              <p><strong>
                CrisisMap es una iniciativa comunitaria gratuita creada para ayudar a
                comunidades durante desastres mediante reportes colaborativos. La
                información es aportada por voluntarios y puede ser inexacta,
                incompleta o desactualizada. CrisisMap no es un servicio oficial de
                emergencias y no debe reemplazar a las autoridades. El uso de esta
                plataforma es enteramente voluntario y bajo su propio riesgo.
              </strong></p>
            </section>

            <section>
              <h3># CrisisMap</h3>
              <h4>Mapa colaborativo de emergencias y ayuda comunitaria</h4>
              <p><strong>Venezuela · Respuesta Ciudadana</strong></p>
            </section>

            <section>
              <h3>Acerca de CrisisMap</h3>
              <p>CrisisMap es una iniciativa humanitaria gratuita, dirigida por
                voluntarios y de código abierto, creada para ayudar a las comunidades
                a compartir información útil durante desastres y emergencias.</p>
              <p>El proyecto fue creado originalmente para apoyar a Venezuela tras una
                emergencia nacional mayor.</p>
              <p>CrisisMap fue iniciado por desarrolladores de software venezolanos en el
                exterior que, sin poder participar físicamente en la respuesta a la
                emergencia, quisieron contribuir con el conocimiento, la experiencia
                y los recursos técnicos disponibles, en lugar de permanecer inactivos
                mientras las comunidades eran afectadas.</p>
              <p>El proyecto recibe con agrado a voluntarios y colaboradores de cualquier
                país que deseen mejorar la plataforma con fines humanitarios.</p>
              <p>CrisisMap es una iniciativa comunitaria y no pertenece ni representa a
                ningún gobierno, organización política, autoridad de emergencias ni
                empresa privada.</p>
              <p><strong>Mantenido por la Comunidad de Código Abierto CrisisMap.</strong></p>
            </section>

            <section>
              <h3>Propósito</h3>
              <p>El propósito de CrisisMap es facilitar la colaboración comunitaria
                permitiendo a los ciudadanos reportar voluntariamente incidentes,
                daños a infraestructura y recursos disponibles durante emergencias.</p>
              <p>Ejemplos incluyen:</p>
              <ul>
                <li>infraestructura dañada;</li>
                <li>vías bloqueadas;</li>
                <li>edificios colapsados;</li>
                <li>refugios;</li>
                <li>agua potable;</li>
                <li>distribución de alimentos;</li>
                <li>hospitales;</li>
                <li>comunicaciones;</li>
                <li>acceso a internet disponible;</li>
                <li>otra información que pueda asistir a comunidades afectadas.</li>
              </ul>
              <p>La plataforma existe únicamente como herramienta colaborativa de
                intercambio de información.</p>
            </section>

            <section>
              <h3>No es un servicio oficial de emergencias</h3>
              <p>CrisisMap no es:</p>
              <ul>
                <li>una central de despacho de emergencias;</li>
                <li>una organización de rescate;</li>
                <li>una plataforma gubernamental;</li>
                <li>una autoridad de protección civil;</li>
                <li>un servicio policial;</li>
                <li>un proveedor médico;</li>
                <li>un servicio de ingeniería;</li>
                <li>un servicio de inspección estructural.</li>
              </ul>
              <p>Los usuarios deben seguir siempre a las autoridades oficiales de
                emergencia cuando estén disponibles.</p>
            </section>

            <section>
              <h3>Información generada por la comunidad</h3>
              <p>Toda la información mostrada en CrisisMap es generada por miembros de
                la comunidad. Los reportes no están garantizados como exactos,
                completos, verificados o actualizados.</p>
              <p>Los reportes pueden contener errores, omisiones, información duplicada
                o desactualizada. La Comunidad de Código Abierto CrisisMap no verifica
                cada reporte antes de su publicación.</p>
            </section>

            <section>
              <h3>Uso bajo su propio riesgo</h3>
              <p>El uso de CrisisMap es enteramente voluntario. Los usuarios reconocen
                que cualquier decisión tomada basándose en la información mostrada por
                la plataforma es de su exclusiva responsabilidad.</p>
              <p>CrisisMap nunca debe ser la única fuente para tomar decisiones de
                seguridad o emergencia. Cuando haya información oficial disponible,
                esta debe prevalecer.</p>
            </section>

            <section>
              <h3>Sin garantía</h3>
              <p>La plataforma se proporciona estrictamente:</p>
              <p><strong>"TAL CUAL"</strong> y <strong>"SEGÚN DISPONIBILIDAD"</strong>.</p>
              <p>No se ofrecen garantías, expresas ni implícitas, sobre:</p>
              <ul>
                <li>disponibilidad;</li>
                <li>tiempo activo;</li>
                <li>continuidad;</li>
                <li>exactitud;</li>
                <li>integridad;</li>
                <li>fiabilidad;</li>
                <li>idoneidad para cualquier propósito.</li>
              </ul>
              <p>La plataforma puede dejar de estar disponible en cualquier momento.</p>
            </section>

            <section>
              <h3>Limitación de responsabilidad</h3>
              <p>Hasta el máximo permitido por la ley aplicable, la Comunidad de Código
                Abierto CrisisMap, sus contribuidores, mantenedores, voluntarios,
                proveedores de infraestructura y colaboradores de código abierto no
                serán responsables por ningún daño directo o indirecto derivado del
                uso o la imposibilidad de usar la plataforma.</p>
              <p>Esta limitación incluye, sin limitación:</p>
              <ul>
                <li>lesiones;</li>
                <li>fallecimientos;</li>
                <li>retrasos en rescates;</li>
                <li>daños materiales;</li>
                <li>pérdidas financieras;</li>
                <li>pérdida de datos;</li>
                <li>interrupción de comunicaciones;</li>
                <li>reportes incorrectos;</li>
                <li>reportes faltantes;</li>
                <li>información desactualizada;</li>
                <li>fallos de infraestructura;</li>
                <li>desastres naturales;</li>
                <li>eventos de fuerza mayor;</li>
                <li>decisiones tomadas por usuarios o terceros basándose en información publicada.</li>
              </ul>
              <p>Nada dentro de CrisisMap se interpretará como la creación de un deber
                legal de prestar servicios de emergencia o garantizar la disponibilidad
                o exactitud de la información.</p>
            </section>

            <section>
              <h3>Responsabilidades del usuario</h3>
              <p>Los usuarios son los únicos responsables del contenido que envían. Se
                comprometen a no enviar intencionalmente:</p>
              <ul>
                <li>información falsa;</li>
                <li>reportes maliciosos;</li>
                <li>contenido ilegal;</li>
                <li>material con derechos de autor sin autorización;</li>
                <li>información personal de terceros sin autorización;</li>
                <li>contenido abusivo u ofensivo.</li>
              </ul>
            </section>

            <section>
              <h3>Moderación comunitaria</h3>
              <p>CrisisMap utiliza verificación comunitaria. Los reportes pueden ser
                confirmados, corregidos, actualizados u ocultados por participación de
                la comunidad. No se garantiza que un reporte permanezca visible. La
                plataforma no tiene obligación de revisar activamente cada envío.</p>
            </section>

            <section>
              <h3>Política de privacidad</h3>
              <p>CrisisMap sigue el principio de mínima recolección de datos. La
                plataforma solo puede recopilar la información necesaria para su
                funcionamiento, incluyendo:</p>
              <ul>
                <li>identificador anónimo de dispositivo;</li>
                <li>alias opcional;</li>
                <li>coordenadas GPS enviadas voluntariamente por el usuario;</li>
                <li>reportes de incidentes;</li>
                <li>fotografías subidas;</li>
                <li>marcas de tiempo.</li>
              </ul>
              <p>La plataforma no requiere:</p>
              <ul>
                <li>nombres reales;</li>
                <li>direcciones de correo electrónico para uso normal;</li>
                <li>números telefónicos;</li>
                <li>documentos de identidad.</li>
              </ul>
            </section>

            <section>
              <h3>Naturaleza pública de los reportes</h3>
              <p>Los usuarios reconocen que los reportes enviados a través de CrisisMap
                están destinados a ser públicamente visibles para apoyar la respuesta
                al desastre. La información enviada puede ser accedida por otros
                usuarios, organizaciones humanitarias, respondedores de emergencia y
                autoridades gubernamentales cuando sea apropiado.</p>
            </section>

            <section>
              <h3>Uso comercial de los datos</h3>
              <p>CrisisMap no vende información personal. No usa información personal
                para publicidad. No crea perfiles comerciales de usuario.</p>
            </section>

            <section>
              <h3>Disponibilidad de la infraestructura</h3>
              <p>La plataforma se mantiene con trabajo voluntario e infraestructura
                donada o financiada por la comunidad. Interrupciones, rendimiento
                degradado, periodos de mantenimiento o cierre permanente pueden ocurrir
                en cualquier momento sin aviso.</p>
            </section>

            <section>
              <h3>Código abierto</h3>
              <p>El software de CrisisMap puede ser publicado bajo una licencia de
                código abierto. Los contribuidores aportan su trabajo voluntariamente
                y sin garantías. Los contribuidores pueden unirse o abandonar el
                proyecto en cualquier momento.</p>
            </section>

            <section>
              <h3>Indemnización</h3>
              <p>Los usuarios aceptan indemnizar y mantener indemne a la Comunidad de
                Código Abierto CrisisMap, sus contribuidores, mantenedores y
                voluntarios por reclamos, responsabilidades, daños, pérdidas y gastos
                legales derivados del mal uso de la plataforma o la violación de
                estos Términos.</p>
            </section>

            <section>
              <h3>Aceptación</h3>
              <p>Al acceder o usar CrisisMap, los usuarios reconocen que han leído,
                comprendido y aceptado estos Términos de Servicio y Política de
                Privacidad.</p>
              <p>Si los usuarios no están de acuerdo con estos Términos, deben
                interrumpir el uso de la plataforma inmediatamente.</p>
            </section>

            <section class="cm-first-launch">
              <p><strong>
                CrisisMap es una iniciativa comunitaria gratuita creada para ayudar a
                comunidades durante desastres mediante reportes colaborativos. La
                información es aportada por voluntarios y puede ser inexacta,
                incompleta o desactualizada. CrisisMap no es un servicio oficial de
                emergencias y no debe reemplazar a las autoridades. El uso de esta
                plataforma es enteramente voluntario y bajo su propio riesgo.
              </strong></p>
            </section>
          </div>

          <footer>
            <label class="cm-checkbox">
              <input type="checkbox" [checked]="accepted()" (change)="toggleAccept($event)" />
              <span>{{ i18n.t('terms.consent') }}</span>
            </label>
            <div class="cm-buttons">
              <button class="cm-btn cm-btn-ghost" (click)="onDecline()">{{ i18n.t('terms.decline') }}</button>
              <button class="cm-btn cm-btn-primary" [disabled]="!accepted()" (click)="onAccept()">
                {{ i18n.t('terms.accept') }}
              </button>
            </div>
          </footer>
        </div>
      </div>
    }
  `,
  styles: [`
    .cm-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.65);
      z-index: 2000; overflow-y: auto;
    }
    .cm-terms {
      background: #fff; margin: 24px auto; max-width: 720px;
      border-radius: 8px; display: flex; flex-direction: column;
      max-height: calc(100vh - 48px); overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,.4);
    }
    header {
      padding: 18px 24px; border-bottom: 1px solid #ddd;
      background: #1976d2; color: #fff;
    }
    header h2 { margin: 0; font-size: 18px; font-weight: 700; }
    .cm-body {
      padding: 16px 24px; overflow-y: auto; flex: 1; line-height: 1.55;
      color: #222; font-size: 14px;
    }
    .cm-body section { margin-bottom: 18px; }
    .cm-body h3 {
      font-size: 15px; margin: 0 0 8px; color: #111;
      font-weight: 700; border-bottom: 1px solid #eee; padding-bottom: 4px;
    }
    .cm-body h4 { font-size: 14px; margin: 0 0 6px; color: #333; font-weight: 600; }
    .cm-body p { margin: 0 0 8px; }
    .cm-body ul { margin: 4px 0 8px; padding-left: 20px; }
    .cm-body li { margin-bottom: 4px; }
    .cm-first-launch {
      background: #fff3e0; border-left: 4px solid #e65100;
      padding: 12px 14px; border-radius: 4px; margin: 12px 0;
    }
    .cm-first-launch p { margin: 0; }
    footer {
      padding: 16px 24px; border-top: 1px solid #ddd; background: #fafafa;
      position: sticky; bottom: 0;
    }
    .cm-checkbox {
      display: flex; align-items: flex-start; gap: 10px;
      font-size: 14px; font-weight: 600; margin-bottom: 12px; cursor: pointer;
    }
    .cm-checkbox input { width: 20px; height: 20px; margin-top: 2px; cursor: pointer; }
    .cm-buttons { display: flex; gap: 8px; }
    .cm-btn {
      flex: 1; padding: 14px; font-size: 15px; font-weight: 600;
      border: none; border-radius: 6px; cursor: pointer;
    }
    .cm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .cm-btn-primary { background: #1976d2; color: #fff; }
    .cm-btn-primary:disabled { background: #999; }
    .cm-btn-ghost { background: transparent; color: #c62828; border: 1px solid #c62828; }
  `],
})
export class TermsComponent {
  readonly i18n = inject(I18nService);
  readonly close = output<void>();
  readonly accepted = signal(false);
  readonly visible = signal(this.shouldShow());

  private shouldShow(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) !== 'accepted';
  }

  toggleAccept(e: Event): void {
    this.accepted.set((e.target as HTMLInputElement).checked);
  }

  onAccept(): void {
    if (!this.accepted()) return;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'accepted');
    }
    this.close.emit();
  }

  onDecline(): void {
    if (typeof window !== 'undefined') {
      window.location.href = 'about:blank';
    }
  }
}