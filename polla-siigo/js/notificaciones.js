/* ============================================================
   POLLA SIIGO 2026 — SISTEMA DE NOTIFICACIONES EN VIVO
   Detecta cambios en partidos y envía notificaciones:
   - Goles
   - Tarjetas rojas
   - Expulsiones
   - Partidos finalizados
   - Partidos que se abren para pronosticar
   ============================================================ */

const Notifica = {
  estadoAnterior: null,
  
  iniciar() {
    console.log('🔔 Sistema de notificaciones iniciado');
    // Solicitar permiso para notificaciones del navegador
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },
  
  limpiarEstado(resultados) {
    // Guardar estado inicial para detectar cambios futuros
    this.estadoAnterior = JSON.parse(JSON.stringify(resultados));
  },
  
  detectarCambios(resultadosActuales, usuario, partidos, prediccionesUsuario) {
    if (!this.estadoAnterior) {
      return { goles: [], rojas: [], finalizados: [], abiertos: [] };
    }
    
    const cambios = {
      goles: [],
      rojas: [],
      finalizados: [],
      abiertos: []
    };
    
    // Detectar cambios en cada partido
    for (const pid in resultadosActuales) {
      const resActual = resultadosActuales[pid];
      const resAnterior = this.estadoAnterior[pid] || {};
      
      // Detectar nuevos goles
      if (resActual.gl !== resAnterior.gl || resActual.gv !== resAnterior.gv) {
        const partido = partidos.find(p => p.id === pid);
        if (partido && resActual.estado === 'en_juego') {
          const diffLocal = (resActual.gl || 0) - (resAnterior.gl || 0);
          const diffVisitante = (resActual.gv || 0) - (resAnterior.gv || 0);
          
          if (diffLocal > 0) {
            cambios.goles.push({
              partido, equipo: partido.local,
              marcadorActual: `${resActual.gl} - ${resActual.gv}`
            });
          }
          if (diffVisitante > 0) {
            cambios.goles.push({
              partido, equipo: partido.visitante,
              marcadorActual: `${resActual.gl} - ${resActual.gv}`
            });
          }
        }
      }
      
      // Detectar tarjetas rojas (en eventos)
      if (resActual.eventos) {
        const eventosAnteriores = resAnterior.eventos || [];
        const eventosNuevos = resActual.eventos.filter(e =>
          !eventosAnteriores.some(ae => ae.j === e.j && ae.m === e.m && ae.t === e.t)
        );
        
        eventosNuevos.forEach(ev => {
          if (ev.t === 'roja') {
            const partido = partidos.find(p => p.id === pid);
            if (partido) {
              cambios.rojas.push({
                partido,
                jugador: ev.j,
                equipo: ev.eq,
                minuto: ev.m
              });
            }
          }
        });
      }
      
      // Detectar partidos finalizados
      if (resActual.estado === 'finalizado' && resAnterior.estado !== 'finalizado') {
        const partido = partidos.find(p => p.id === pid);
        if (partido) {
          cambios.finalizados.push({
            partido,
            marcador: `${resActual.gl} - ${resActual.gv}`
          });
        }
      }
    }
    
    // Detectar partidos que se abren (de cerrado a programado)
    // Nota: partidos aplazados NO se consideran abiertos para pronósticos
    for (const partido of partidos) {
      const resActual = resultadosActuales[partido.id];
      const resAnterior = this.estadoAnterior[partido.id];
      
      const estadoActual = resActual?.estado || (partido.utc ? 'programado' : 'sin_definir');
      const estadoAnterior = resAnterior?.estado || (partido.utc ? 'programado' : 'sin_definir');
      
      // Si estaba cerrado y ahora está programado (no aplazado)
      if ((estadoAnterior === 'cerrado' || !estadoAnterior) && 
          estadoActual === 'programado') {
        cambios.abiertos.push({
          partido,
          estado: estadoActual
        });
      }
    }
    
    return cambios;
  },
  
  notificarCambios(cambios, usuario, prediccionesUsuario) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      console.log('🔔 Notificaciones no disponibles o no autorizadas');
      return;
    }
    
    // Notificar goles
    cambios.goles.forEach(c => {
      const L = window.FIXTURE.equipo(c.partido.local);
      const V = window.FIXTURE.equipo(c.partido.visitante);
      const nombreEquipoGol = window.FIXTURE.equipo(c.equipo)?.n || c.equipo;
      
      const titulo = `⚽ ¡GOL de ${nombreEquipoGol}!`;
      const cuerpo = `Marcador: ${L.n} vs ${V.n} ahora está ${c.marcadorActual}`;
      
      new Notification(titulo, {
        body: cuerpo,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: `gol-${c.partido.id}-${c.marcadorActual}`
      });

      // Reproducir sonido de gol
      const audio = document.getElementById('sonido-gol');
      if (audio) {
        audio.play().catch(error => {
          // La reproducción automática puede ser bloqueada por el navegador
          console.warn("No se pudo reproducir el sonido de gol:", error);
        });
      }
    });
    
    // Notificar tarjetas rojas
    cambios.rojas.forEach(c => {
      const nombreEquipo = window.FIXTURE.equipo(c.equipo)?.n || c.equipo;
      const titulo = `🟥 Tarjeta roja para ${nombreEquipo}`;
      const cuerpo = `Expulsado: ${c.jugador} (${c.minuto}')`;
      
      new Notification(titulo, {
        body: cuerpo,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: `roja-${c.partido.id}-${c.jugador}`
      });
    });
    
    // Notificar partidos finalizados
    cambios.finalizados.forEach(c => {
      const L = window.FIXTURE.equipo(c.partido.local);
      const V = window.FIXTURE.equipo(c.partido.visitante);
      const titulo = `🏁 Partido finalizado`;
      const cuerpo = `${L.n} ${c.marcador} ${V.n}`;
      
      new Notification(titulo, {
        body: cuerpo,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: `finalizado-${c.partido.id}`,
        requireInteraction: true
      });
    });
    
    // Notificar partidos que se abren
    cambios.abiertos.forEach(c => {
      const L = window.FIXTURE.equipo(c.partido.local);
      const V = window.FIXTURE.equipo(c.partido.visitante);
      const titulo = `🔓 Partido disponible`;
      const cuerpo = `${L.n} vs ${V.n} - ¡Pronostica ahora!`;
      
      new Notification(titulo, {
        body: cuerpo,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: `abierto-${c.partido.id}`
      });
    });
  },
  
  iniciarRecordatorios(usuario, partidos, resultados, prediccionesUsuario) {
    // Verificar cada 5 minutos si hay partidos por pronosticar que cierran pronto
    setInterval(() => {
      const ahora = Date.now();
      const partidosPorPronosticar = partidos.filter(p => {
        const res = resultados[p.id];
        const estado = res?.estado || (p.utc ? 'programado' : 'sin_definir');
        const yaPronostico = prediccionesUsuario[p.id];
        
        // Solo considerar partidos programados sin pronóstico (no aplazados)
        if (estado !== 'programado') return false;
        if (yaPronostico) return false;
        if (!p.utc) return false;
        
        // Si cierra en menos de 30 minutos
        const cierre = new Date(p.utc).getTime();
        const tiempoRestante = cierre - ahora;
        return tiempoRestante > 0 && tiempoRestante < 30 * 60 * 1000;
      });
      
      if (partidosPorPronosticar.length > 0 && Notification.permission === 'granted') {
        const titulo = `⏰ ¡Partidos por pronosticar!`;
        const cuerpo = `${partidosPorPronosticar.length} partido(s) cierran pronto`;
        
        new Notification(titulo, {
          body: cuerpo,
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          tag: 'recordatorio-pronosticos'
        });
      }
    }, 5 * 60 * 1000); // Cada 5 minutos
  }
};

window.Notifica = Notifica;
