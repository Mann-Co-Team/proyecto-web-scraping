// Datos de la aplicación
const appData = {
  "propiedades": [
    {
      "id": 1,
      "titulo": "Departamento 2 dormitorios centro Talca",
      "precio": 450000,
      "ubicacion": "Centro, Talca",
      "tipo": "Departamento",
      "dormitorios": 2,
      "banos": 1,
      "metros": 65,
      "descripcion": "Hermoso departamento en el corazón de Talca, cerca de servicios y transporte",
      "imagen": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400",
      "destacado": true,
      "contacto": {
        "nombre": "María González",
        "telefono": "+56912345678"
      },
      "amenidades": ["Estacionamiento", "Logia", "Cercano a metro"]
    },
    {
      "id": 2,
      "titulo": "Casa 3 dormitorios Villa Las Rastras",
      "precio": 650000,
      "ubicacion": "Las Rastras, Talca",
      "tipo": "Casa",
      "dormitorios": 3,
      "banos": 2,
      "metros": 120,
      "descripcion": "Amplia casa en sector residencial tranquilo, ideal para familias",
      "imagen": "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400",
      "destacado": true,
      "contacto": {
        "nombre": "Carlos Muñoz",
        "telefono": "+56987654321"
      },
      "amenidades": ["Jardín", "Estacionamiento", "Quincho"]
    },
    {
      "id": 3,
      "titulo": "Pieza para estudiante cerca UTALCA",
      "precio": 180000,
      "ubicacion": "Cerca Universidad, Talca",
      "tipo": "Pieza",
      "dormitorios": 1,
      "banos": 1,
      "metros": 25,
      "descripcion": "Pieza cómoda para estudiante con todos los servicios incluidos",
      "imagen": "https://images.unsplash.com/photo-1586105251261-72a756497a11?w=400",
      "destacado": false,
      "contacto": {
        "nombre": "Ana Rojas",
        "telefono": "+56956789123"
      },
      "amenidades": ["Internet", "Servicios incluidos", "Cercano universidad"]
    },
    {
      "id": 4,
      "titulo": "Departamento amoblado 1 dormitorio",
      "precio": 380000,
      "ubicacion": "2 Norte, Talca",
      "tipo": "Departamento",
      "dormitorios": 1,
      "banos": 1,
      "metros": 45,
      "descripcion": "Departamento completamente amoblado listo para habitar",
      "imagen": "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400",
      "destacado": true,
      "contacto": {
        "nombre": "Jorge Pérez",
        "telefono": "+56923456789"
      },
      "amenidades": ["Amoblado", "Calefacción", "Electrodomésticos"]
    },
    {
      "id": 5,
      "titulo": "Casa 4 dormitorios con piscina",
      "precio": 850000,
      "ubicacion": "Villa Culenar, Talca",
      "tipo": "Casa",
      "dormitorios": 4,
      "banos": 3,
      "metros": 180,
      "descripcion": "Hermosa casa con piscina en condominio privado",
      "imagen": "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=400",
      "destacado": false,
      "contacto": {
        "nombre": "Patricia Silva",
        "telefono": "+56934567890"
      },
      "amenidades": ["Piscina", "Jardín", "Estacionamiento doble", "Seguridad"]
    },
    {
      "id": 6,
      "titulo": "Departamento nuevo 2D+1B",
      "precio": 520000,
      "ubicacion": "Sector Oriente, Talca",
      "tipo": "Departamento",
      "dormitorios": 2,
      "banos": 1,
      "metros": 70,
      "descripcion": "Departamento a estrenar con terminaciones premium",
      "imagen": "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400",
      "destacado": true,
      "contacto": {
        "nombre": "Roberto Díaz",
        "telefono": "+56945678901"
      },
      "amenidades": ["Nuevo", "Ascensor", "Terraza", "Estacionamiento"]
    }
  ],
  "ubicaciones": [
    "Centro",
    "Las Rastras", 
    "Villa Culenar",
    "Sector Oriente",
    "2 Norte",
    "Cerca Universidad",
    "Villa Las Araucarias",
    "San Miguel"
  ],
  "tiposPropiedad": [
    "Departamento",
    "Casa", 
    "Pieza",
    "Casa Pareada",
    "Oficina",
    "Local Comercial"
  ],
  "rangosPrecios": [
    {"min": 0, "max": 200000, "label": "Hasta $200.000"},
    {"min": 200000, "max": 400000, "label": "$200.000 - $400.000"},
    {"min": 400000, "max": 600000, "label": "$400.000 - $600.000"},
    {"min": 600000, "max": 999999, "label": "Más de $600.000"}
  ]
};

// Estado de la aplicación
class AppState {
  constructor() {
    this.currentUser = null;
    this.favoritos = [];
    this.filtros = {
      tipo: '',
      ubicacion: '',
      precioMax: 1000000,
      dormitorios: []
    };
    this.currentView = 'inicio';
    this.init();
  }

  init() {
    this.loadUserFromStorage();
    this.loadFavoritosFromStorage();
  }

  loadUserFromStorage() {
    const userData = localStorage.getItem('arriendos_user');
    if (userData) {
      this.currentUser = JSON.parse(userData);
    }
  }

  loadFavoritosFromStorage() {
    const favoritosData = localStorage.getItem('arriendos_favoritos');
    if (favoritosData) {
      this.favoritos = JSON.parse(favoritosData);
    }
  }

  login(userData) {
    this.currentUser = userData;
    localStorage.setItem('arriendos_user', JSON.stringify(userData));
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('arriendos_user');
  }

  addFavorito(propiedadId) {
    if (!this.favoritos.includes(propiedadId)) {
      this.favoritos.push(propiedadId);
      localStorage.setItem('arriendos_favoritos', JSON.stringify(this.favoritos));
    }
  }

  removeFavorito(propiedadId) {
    this.favoritos = this.favoritos.filter(id => id !== propiedadId);
    localStorage.setItem('arriendos_favoritos', JSON.stringify(this.favoritos));
  }

  isFavorito(propiedadId) {
    return this.favoritos.includes(propiedadId);
  }
}

// Instancia global del estado
const appState = new AppState();

// Utilidades
const utils = {
  formatPrice: (price) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(price);
  },

  showNotification: (message, type = 'success') => {
    const notification = document.createElement('div');
    notification.className = `${type}-message`;
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '10000';
    notification.style.padding = '12px 16px';
    notification.style.borderRadius = '8px';
    notification.style.fontWeight = '500';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  },

  validateEmail: (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },

  simulateApiCall: (delay = 1000) => {
    return new Promise(resolve => setTimeout(resolve, delay));
  }
};

// Navegación
class Navigation {
  constructor() {
    this.init();
  }

  init() {
    this.setupNavigation();
    this.updateAuthDisplay();
  }

  setupNavigation() {
    // Enlaces de navegación principal
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href) {
          this.navigateTo(href.substring(1));
        }
      });
    });

    // Enlaces del dropdown de usuario
    document.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const href = item.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          // Cerrar el dropdown
          document.getElementById('userDropdownMenu').classList.add('hidden');
          this.navigateTo(href.substring(1));
        }
      });
    });

    // Enlaces del footer
    document.querySelectorAll('footer a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href && href !== '#') {
          this.navigateTo(href.substring(1));
        }
      });
    });
  }

  navigateTo(view) {
    // Validar acceso a vistas protegidas
    if (['dashboard', 'favoritos'].includes(view) && !appState.currentUser) {
      modalManager.openModal('loginModal');
      return;
    }

    // Ocultar todas las vistas
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    
    // Mostrar la vista solicitada
    const targetView = document.getElementById(`${view}View`);
    if (targetView) {
      targetView.classList.add('active');
      appState.currentView = view;
    }

    // Actualizar navegación activa
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${view}`) {
        link.classList.add('active');
      }
    });

    // Cargar contenido específico de la vista
    this.loadViewContent(view);

    // Scroll al top
    window.scrollTo(0, 0);
  }

  loadViewContent(view) {
    switch (view) {
      case 'inicio':
        propertyManager.renderFeaturedProperties();
        break;
      case 'propiedades':
        propertyManager.renderAllProperties();
        break;
      case 'dashboard':
        this.loadDashboard();
        break;
      case 'favoritos':
        propertyManager.renderFavoriteProperties();
        break;
    }
  }

  loadDashboard() {
    // El dashboard ya está cargado en el HTML
    console.log('Dashboard cargado para:', appState.currentUser.nombre);
  }

  updateAuthDisplay() {
    const navAuth = document.getElementById('navAuth');
    const navUser = document.getElementById('navUser');
    const userName = document.getElementById('userName');

    if (appState.currentUser) {
      navAuth.classList.add('hidden');
      navUser.classList.remove('hidden');
      userName.textContent = appState.currentUser.nombre;
    } else {
      navAuth.classList.remove('hidden');
      navUser.classList.add('hidden');
    }
  }
}

// Gestión de modales
class ModalManager {
  constructor() {
    this.init();
  }

  init() {
    this.setupModalEvents();
  }

  setupModalEvents() {
    // Botones de apertura de modales
    document.getElementById('loginBtn').addEventListener('click', () => {
      this.openModal('loginModal');
    });

    document.getElementById('registerBtn').addEventListener('click', () => {
      this.openModal('registerModal');
    });

    // Botones de cierre de modales
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target === el) {
          this.closeModal(el.closest('.modal').id);
        }
      });
    });

    // Navegación entre modales
    document.getElementById('goToRegister').addEventListener('click', () => {
      this.closeModal('loginModal');
      this.openModal('registerModal');
    });

    document.getElementById('goToLogin').addEventListener('click', () => {
      this.closeModal('registerModal');
      this.openModal('loginModal');
    });

    // Escape key para cerrar modales
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
          this.closeModal(modal.id);
        });
      }
    });
  }

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }
}

// Gestión de autenticación
class AuthManager {
  constructor() {
    this.init();
  }

  init() {
    this.setupAuthForms();
    this.setupUserDropdown();
  }

  setupAuthForms() {
    // Formulario de login
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin(e.target);
    });

    // Formulario de registro
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleRegister(e.target);
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
      e.preventDefault();
      this.handleLogout();
    });
  }

  setupUserDropdown() {
    const dropdownBtn = document.getElementById('userDropdownBtn');
    const dropdownMenu = document.getElementById('userDropdownMenu');

    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      dropdownMenu.classList.add('hidden');
    });
  }

  async handleLogin(form) {
    const email = form.querySelector('#loginEmail').value;
    const password = form.querySelector('#loginPassword').value;

    if (!utils.validateEmail(email)) {
      utils.showNotification('Email inválido', 'error');
      return;
    }

    if (password.length < 6) {
      utils.showNotification('La contraseña debe tener al menos 6 caracteres', 'error');
      return;
    }

    // Simular llamada API
    try {
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.textContent = 'Iniciando sesión...';
      submitBtn.disabled = true;

      await utils.simulateApiCall(1500);

      // Simular usuario logueado
      const userData = {
        id: Date.now(),
        nombre: email.split('@')[0],
        email: email
      };

      appState.login(userData);
      navigation.updateAuthDisplay();
      modalManager.closeModal('loginModal');
      
      utils.showNotification('Sesión iniciada correctamente');
      
      // Resetear formulario
      form.reset();

    } catch (error) {
      utils.showNotification('Error al iniciar sesión', 'error');
    } finally {
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.textContent = 'Iniciar Sesión';
      submitBtn.disabled = false;
    }
  }

  async handleRegister(form) {
    const nombre = form.querySelector('#registerName').value;
    const email = form.querySelector('#registerEmail').value;
    const telefono = form.querySelector('#registerPhone').value;
    const password = form.querySelector('#registerPassword').value;

    if (!nombre.trim()) {
      utils.showNotification('El nombre es requerido', 'error');
      return;
    }

    if (!utils.validateEmail(email)) {
      utils.showNotification('Email inválido', 'error');
      return;
    }

    if (password.length < 6) {
      utils.showNotification('La contraseña debe tener al menos 6 caracteres', 'error');
      return;
    }

    // Simular llamada API
    try {
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.textContent = 'Registrando...';
      submitBtn.disabled = true;

      await utils.simulateApiCall(2000);

      // Simular usuario registrado
      const userData = {
        id: Date.now(),
        nombre: nombre,
        email: email,
        telefono: telefono
      };

      appState.login(userData);
      navigation.updateAuthDisplay();
      modalManager.closeModal('registerModal');
      
      utils.showNotification('Cuenta creada exitosamente');
      
      // Resetear formulario
      form.reset();

    } catch (error) {
      utils.showNotification('Error al crear la cuenta', 'error');
    } finally {
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.textContent = 'Registrarse';
      submitBtn.disabled = false;
    }
  }

  handleLogout() {
    appState.logout();
    navigation.updateAuthDisplay();
    navigation.navigateTo('inicio');
    utils.showNotification('Sesión cerrada');
  }
}

// Gestión de propiedades
class PropertyManager {
  constructor() {
    this.init();
  }

  init() {
    this.setupSearchForm();
    this.setupFilters();
    this.setupPropertyDetailModal();
    this.populateFilterOptions();
  }

  populateFilterOptions() {
    // Poblar selectores de búsqueda principal
    const tipoSelect = document.getElementById('tipoPropiedad');
    const ubicacionSelect = document.getElementById('ubicacionFiltro');
    const precioSelect = document.getElementById('precioFiltro');

    // Poblar tipos de propiedad
    appData.tiposPropiedad.forEach(tipo => {
      const option = document.createElement('option');
      option.value = tipo;
      option.textContent = tipo;
      tipoSelect.appendChild(option);
    });

    // Poblar ubicaciones
    appData.ubicaciones.forEach(ubicacion => {
      const option = document.createElement('option');
      option.value = ubicacion;
      option.textContent = ubicacion;
      ubicacionSelect.appendChild(option);
    });

    // Poblar rangos de precio
    appData.rangosPrecios.forEach(rango => {
      const option = document.createElement('option');
      option.value = `${rango.min}-${rango.max}`;
      option.textContent = rango.label;
      precioSelect.appendChild(option);
    });

    // Poblar filtros de la página de propiedades
    const filtroTipoSelect = document.getElementById('filtroTipo');
    const filtroUbicacionSelect = document.getElementById('filtroUbicacion');

    appData.tiposPropiedad.forEach(tipo => {
      const option = document.createElement('option');
      option.value = tipo;
      option.textContent = tipo;
      filtroTipoSelect.appendChild(option.cloneNode(true));
    });

    appData.ubicaciones.forEach(ubicacion => {
      const option = document.createElement('option');
      option.value = ubicacion;
      option.textContent = ubicacion;
      filtroUbicacionSelect.appendChild(option.cloneNode(true));
    });
  }

  setupSearchForm() {
    document.getElementById('buscarBtn').addEventListener('click', () => {
      this.handleSearch();
    });
  }

  setupFilters() {
    // Slider de precio
    const precioMax = document.getElementById('precioMax');
    const precioDisplay = document.getElementById('precioDisplay');

    precioMax.addEventListener('input', (e) => {
      precioDisplay.textContent = utils.formatPrice(e.target.value);
    });

    // Aplicar filtros
    document.getElementById('aplicarFiltros').addEventListener('click', () => {
      this.applyFilters();
    });
  }

  setupPropertyDetailModal() {
    document.getElementById('closePropertyModal').addEventListener('click', () => {
      modalManager.closeModal('propertyDetailModal');
    });
  }

  handleSearch() {
    const tipo = document.getElementById('tipoPropiedad').value;
    const ubicacion = document.getElementById('ubicacionFiltro').value;
    const precio = document.getElementById('precioFiltro').value;

    // Aplicar filtros de búsqueda
    appState.filtros = {
      tipo: tipo,
      ubicacion: ubicacion,
      precio: precio,
      dormitorios: []
    };

    // Navegar a la página de propiedades
    navigation.navigateTo('propiedades');
  }

  applyFilters() {
    const tipo = document.getElementById('filtroTipo').value;
    const ubicacion = document.getElementById('filtroUbicacion').value;
    const precioMax = document.getElementById('precioMax').value;
    const dormitorios = Array.from(document.querySelectorAll('.checkbox-group input:checked'))
      .map(cb => parseInt(cb.value));

    appState.filtros = {
      tipo: tipo,
      ubicacion: ubicacion,
      precioMax: parseInt(precioMax),
      dormitorios: dormitorios
    };

    this.renderAllProperties();
  }

  filterProperties(propiedades) {
    return propiedades.filter(propiedad => {
      // Filtro por tipo
      if (appState.filtros.tipo && propiedad.tipo !== appState.filtros.tipo) {
        return false;
      }

      // Filtro por ubicación
      if (appState.filtros.ubicacion && !propiedad.ubicacion.includes(appState.filtros.ubicacion)) {
        return false;
      }

      // Filtro por precio máximo
      if (appState.filtros.precioMax && propiedad.precio > appState.filtros.precioMax) {
        return false;
      }

      // Filtro por dormitorios
      if (appState.filtros.dormitorios.length > 0) {
        const dormitoriosPropiedad = propiedad.dormitorios >= 4 ? 4 : propiedad.dormitorios;
        if (!appState.filtros.dormitorios.includes(dormitoriosPropiedad)) {
          return false;
        }
      }

      return true;
    });
  }

  renderFeaturedProperties() {
    const container = document.getElementById('propiedadesDestacadas');
    const propiedadesDestacadas = appData.propiedades.filter(p => p.destacado);
    
    container.innerHTML = propiedadesDestacadas.map(propiedad => 
      this.createPropertyCard(propiedad)
    ).join('');

    this.attachPropertyCardEvents(container);
  }

  renderAllProperties() {
    const container = document.getElementById('todasPropiedades');
    const propiedadesFiltradas = this.filterProperties(appData.propiedades);
    
    if (propiedadesFiltradas.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-search"></i>
          <p>No se encontraron propiedades con los filtros aplicados</p>
          <button class="btn btn--primary" onclick="location.reload()">Limpiar Filtros</button>
        </div>
      `;
      return;
    }

    container.innerHTML = propiedadesFiltradas.map(propiedad => 
      this.createPropertyCard(propiedad)
    ).join('');

    this.attachPropertyCardEvents(container);
  }

  renderFavoriteProperties() {
    const container = document.getElementById('propiedadesFavoritas');
    const propiedadesFavoritas = appData.propiedades.filter(p => 
      appState.favoritos.includes(p.id)
    );

    if (propiedadesFavoritas.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-heart"></i>
          <p>No tienes propiedades favoritas aún</p>
          <a href="#propiedades" class="btn btn--primary">Explorar Propiedades</a>
        </div>
      `;
      return;
    }

    container.innerHTML = propiedadesFavoritas.map(propiedad => 
      this.createPropertyCard(propiedad)
    ).join('');

    this.attachPropertyCardEvents(container);
  }

  createPropertyCard(propiedad) {
    const isFavorito = appState.isFavorito(propiedad.id);
    
    return `
      <div class="property-card" data-property-id="${propiedad.id}">
        <img src="${propiedad.imagen}" alt="${propiedad.titulo}" class="property-image" loading="lazy">
        <div class="property-content">
          <h3 class="property-title">${propiedad.titulo}</h3>
          <div class="property-price">${utils.formatPrice(propiedad.precio)}</div>
          <div class="property-location">
            <i class="fas fa-map-marker-alt"></i> ${propiedad.ubicacion}
          </div>
          <div class="property-features">
            <span><i class="fas fa-bed"></i> ${propiedad.dormitorios} dorm.</span>
            <span><i class="fas fa-bath"></i> ${propiedad.banos} baño${propiedad.banos > 1 ? 's' : ''}</span>
            <span><i class="fas fa-ruler-combined"></i> ${propiedad.metros}m²</span>
          </div>
          <div class="property-actions">
            <button class="btn btn--primary btn--sm property-detail-btn">Ver Detalles</button>
            ${appState.currentUser ? `
              <button class="favorite-btn ${isFavorito ? 'active' : ''}" data-property-id="${propiedad.id}">
                <i class="fas fa-heart"></i>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  attachPropertyCardEvents(container) {
    // Eventos de ver detalles
    container.querySelectorAll('.property-detail-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = e.target.closest('.property-card');
        const propertyId = parseInt(card.dataset.propertyId);
        this.showPropertyDetail(propertyId);
      });
    });

    // Eventos de favoritos
    container.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const propertyId = parseInt(btn.dataset.propertyId);
        this.toggleFavorite(propertyId, btn);
      });
    });

    // Click en la card para ver detalles
    container.querySelectorAll('.property-card').forEach(card => {
      card.addEventListener('click', () => {
        const propertyId = parseInt(card.dataset.propertyId);
        this.showPropertyDetail(propertyId);
      });
    });
  }

  showPropertyDetail(propertyId) {
    const propiedad = appData.propiedades.find(p => p.id === propertyId);
    if (!propiedad) return;

    const modalTitle = document.getElementById('propertyDetailTitle');
    const modalContent = document.getElementById('propertyDetailContent');

    modalTitle.textContent = propiedad.titulo;
    
    modalContent.innerHTML = `
      <div class="property-detail">
        <img src="${propiedad.imagen}" alt="${propiedad.titulo}" class="property-detail-image">
        <div class="property-detail-info">
          <div class="property-detail-price">${utils.formatPrice(propiedad.precio)}</div>
          <p><strong>Ubicación:</strong> ${propiedad.ubicacion}</p>
          <p><strong>Tipo:</strong> ${propiedad.tipo}</p>
          <p><strong>Características:</strong> ${propiedad.dormitorios} dormitorios, ${propiedad.banos} baños, ${propiedad.metros}m²</p>
          <p><strong>Descripción:</strong> ${propiedad.descripcion}</p>
          
          <div class="property-amenities">
            <strong>Amenidades:</strong>
            ${propiedad.amenidades.map(amenidad => 
              `<span class="amenity-tag">${amenidad}</span>`
            ).join('')}
          </div>
          
          <div class="contact-info">
            <h4>Información de Contacto</h4>
            <p><strong>Contacto:</strong> ${propiedad.contacto.nombre}</p>
            <p><strong>Teléfono:</strong> ${propiedad.contacto.telefono}</p>
            <div style="margin-top: 16px;">
              <button class="btn btn--primary">
                <i class="fas fa-phone"></i> Llamar
              </button>
              <button class="btn btn--outline">
                <i class="fas fa-envelope"></i> Enviar Mensaje
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    modalManager.openModal('propertyDetailModal');
  }

  toggleFavorite(propertyId, btn) {
    if (!appState.currentUser) {
      modalManager.openModal('loginModal');
      return;
    }

    if (appState.isFavorito(propertyId)) {
      appState.removeFavorito(propertyId);
      btn.classList.remove('active');
      utils.showNotification('Removido de favoritos');
    } else {
      appState.addFavorito(propertyId);
      btn.classList.add('active');
      utils.showNotification('Agregado a favoritos');
    }
  }
}

// Inicialización de la aplicación
class App {
  constructor() {
    this.init();
  }

  init() {
    // Esperar a que el DOM esté cargado
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.start();
      });
    } else {
      this.start();
    }
  }

  start() {
    // Inicializar todos los managers
    window.navigation = new Navigation();
    window.modalManager = new ModalManager();
    window.authManager = new AuthManager();
    window.propertyManager = new PropertyManager();

    // Configurar eventos adicionales
    this.setupAdditionalEvents();

    // Cargar contenido inicial
    propertyManager.renderFeaturedProperties();
    
    console.log('ArriendosTalca App iniciada correctamente');
  }

  setupAdditionalEvents() {
    // Botón de ver favoritos en dashboard
    document.getElementById('verFavoritosBtn').addEventListener('click', () => {
      navigation.navigateTo('favoritos');
    });

    // Enlaces internos adicionales
    document.querySelectorAll('a[href="#propiedades"]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigation.navigateTo('propiedades');
      });
    });

    // Manejar navegación desde enlaces en estado vacío de favoritos
    document.addEventListener('click', (e) => {
      if (e.target.matches('a[href="#propiedades"]')) {
        e.preventDefault();
        navigation.navigateTo('propiedades');
      }
    });
  }
}

// Instanciar la aplicación
const app = new App();