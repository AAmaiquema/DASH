const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');


const app = express();
const port = 3000;

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});

// Middleware para parsear el cuerpo de las solicitudes como JSON y URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de la sesión
app.use(session({
  secret: 'tu_clave_secreta', // Cambiar esto a una clave secreta
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Cambia a true si usas HTTPS
}));

// Conexión Base de Datos
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root', // Usuario predeterminado de MySQL en XAMPP
  password: '', // Deja la contraseña vacía si no has configurado una
  database: 'Plataforma', // Cambia esto al nombre de la base de datos que creaste
  port: 3306, // Puerto predeterminado de MySQL
});

connection.connect((error) => {
  if (error) {
    console.error('Error conectando a la base de datos:', error);
    process.exit(1);
  }
  console.log('Conectado a la base de datos');
});

// Servir archivos estáticos desde las carpetas 'css', 'imagenes' y 'streams'
app.use(express.static(path.join(__dirname, '../css')));
app.use(express.static(path.join(__dirname, '../imagenes')));
app.use('/stream', express.static(path.join(__dirname, '..', 'stream')));
app.use('/node_modules', express.static(path.join(__dirname, '../node_modules')));


// Ruta para el login
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../view/login.html'));
});

// Ruta para el registro
app.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../view/register.html'));
});

// Ruta para el inicio
app.get('/home.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../view/home.html'));
});

// Ruta para editar perfil
app.get('/profile.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../view/profile.html'));
});

// Ruta para transmitir
app.get('/transmitir.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../view/transmitir.html'));
});

// Ruta para ver directo
app.get('/verenvivo.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../view/verenvivo.html'));
});

// Registro de usuarios
app.post('/register', async (req, res) => {
  const { nombre, apellido, correo, fecha_nacimiento, username, contrasena } = req.body;

  // Validaciones
  if (!nombre || !apellido || !correo || !fecha_nacimiento || !username || !contrasena) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  // Validación de correo electrónico
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(correo)) {
    return res.status(400).json({ error: 'Correo electrónico no es válido' });
  }

  try {
    // Generar un hash de la contraseña
    const hashedPassword = await bcrypt.hash(contrasena, 10);

    // Insertar datos en la base de datos
    const query = 'INSERT INTO usuarios (nombre, apellido, correo, fecha_nacimiento, username, contrasena) VALUES (?, ?, ?, ?, ?, ?)';
    connection.query(query, [nombre, apellido, correo, fecha_nacimiento, username, hashedPassword], (error) => {
      if (error) {
        console.error('Error al insertar datos:', error);
        return res.status(500).send('Error al registrar usuario');
      }
      res.redirect('/'); // Redirigir a la vista de login
    });
  } catch (error) {
    console.error('Error al hashear la contraseña:', error);
    return res.status(500).send('Error en el servidor');
  }
});

// Inicio de sesión
app.post('/login', async (req, res) => {
  const { username, contrasena } = req.body;

  // Validación de campos vacíos
  if (!username || !contrasena) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  const query = 'SELECT * FROM usuarios WHERE username = ?';
  connection.query(query, [username], async (error, results) => {
    if (error) {
      console.error('Error al realizar la consulta:', error);
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    if (results.length > 0) {
      const user = results[0];

      try {
        const match = await bcrypt.compare(contrasena, user.contrasena);
        if (match) {
          req.session.userId = user.id; // Almacena el ID del usuario en la sesión
          return res.json({ redirect: '/home.html' }); // Redirigir si el inicio de sesión es exitoso
        } else {
          return res.json({ error: 'Usuario o contraseña incorrectos' });
        }
      } catch (err) {
        console.error('Error al comparar la contraseña:', err);
        return res.status(500).json({ error: 'Error en el servidor' });
      }
    } else {
      return res.json({ error: 'Usuario o contraseña incorrectos' });
    }
  });
});

// Cerrar sesión
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error al cerrar sesión:', err);
      return res.status(500).json({ error: 'Error al cerrar sesión' });
    }
    res.redirect('/'); // Redirigir a la página de inicio o de login
  });
});

// Obtener Datos del Usuario
app.get('/api/user', (req, res) => {
  const userId = req.session.userId; // Obtiene el ID del usuario de la sesión

  if (!userId) {
    return res.status(401).json({ error: 'No estás autenticado' });
  }

  const query = 'SELECT * FROM usuarios WHERE id = ?';
  connection.query(query, [userId], (error, results) => {
    if (error) {
      console.error('Error al obtener los datos del usuario:', error);
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    if (results.length > 0) {
      return res.json(results[0]); // Devolver el primer resultado
    } else {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
  });
});

// Actualización de datos
app.post('/api/updateUser', async (req, res) => {
  const userId = req.session.userId; // Obtiene el ID del usuario de la sesión
  const { nombre, apellido, correo, fecha_nacimiento, username, bio, pais } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'No estás autenticado' });
  }

  const fecha_actualizacion = new Date();

  // Consulta para actualizar los datos del usuario
  const query = `
      UPDATE usuarios 
      SET nombre = ?, apellido = ?, correo = ?, fecha_nacimiento = ?, username = ?, bio = ?, pais = ?, fecha_actualizacion = ?
      WHERE id = ?
  `;
  connection.query(query, [nombre, apellido, correo, fecha_nacimiento, username, bio, pais, fecha_actualizacion, userId], (error) => {
    if (error) {
      console.error('Error al actualizar los datos del usuario:', error);
      return res.status(500).json({ error: 'Error al actualizar el usuario' });
    }

    res.status(200).json({ message: 'Usuario actualizado exitosamente' });
  });
});

app.get('/get-user-id', (req, res) => {
  const userId = req.session.userId;
  res.json({ userId: userId });
});

//CAMARA
app.post('/create-folder', (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ success: false, error: "El ID del usuario es requerido." });
  }

  const folderPath = path.join(__dirname, `../stream/stream${userId}`);
  // Crear la carpeta si no existe
  fs.mkdir(folderPath, { recursive: true }, (err) => {
    if (err) {
      console.error("Error al crear la carpeta:", err);
      return res.json({ success: false, error: "No se pudo crear la carpeta." });
    }

    console.log("Carpeta creada exitosamente:", folderPath);
      res.json({ success: true });
  });
});

app.delete('/delete-folder', (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ success: false, error: "El ID del usuario es requerido." });
  }

  const folderPath = path.join(__dirname, `../stream/stream${userId}`);

  // Eliminar la carpeta si existe
  fs.rm(folderPath, { recursive: true, force: true }, (err) => {
    if (err) {
      console.error("Error al eliminar la carpeta:", err);
      return res.json({ success: false, error: "No se pudo eliminar la carpeta." });
    }

    console.log("Carpeta de stream creada exitosamente:", folderPath);
    res.json({ success: true });
  });
});

let ffmpegProcess = null; 
app.post('/start-stream', (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).send('Usuario no autenticado'); // Verifica si el usuario está autenticado
  }
  // Argumentos de ffmpeg separados
  const args = [
    '-f', 'dshow',
    '-i', 'video=USB Camera:audio=Micrófono (Realtek High Definition Audio)', // Captura video y audio
    '-rtbufsize', '1024M',

    // Configuración de video adaptativo
    '-map', '0:v', 
    '-c:v:0', 'libx264', '-b:v:0', '500k', '-s:v:0', '640x360', '-preset', 'superfast', '-g', '30', '-keyint_min', '30',
    
    '-map', '0:v', 
    '-c:v:1', 'libx264', '-b:v:1', '800k', '-s:v:1', '1280x720', '-preset', 'superfast', '-g', '30', '-keyint_min', '30',
    
    '-map', '0:v', 
    '-c:v:2', 'libx264', '-b:v:2', '1500k', '-s:v:2', '1920x1080', '-preset', 'superfast', '-g', '30', '-keyint_min', '30',

    // Configuración de audio
    '-map', '0:a', '-c:a', 'aac', '-b:a', '128k', '-ac', '2',

    // Configuración de DASH
    '-f', 'dash',
    '-seg_duration', '4',
    '-use_timeline', '0',
    '-use_template', '1',
    '-window_size', '5',
    '-time_shift_buffer_depth', '60',
    '-adaptation_sets', 'id=0,streams=v id=1,streams=a',
    `stream/stream${userId}/manifest.mpd`
  ];

  ffmpegProcess = spawn(ffmpegPath, args);

  ffmpegProcess.stdout.on('data', (data) => {
    console.log(`ffmpeg stdout: ${data}`);
  });

  ffmpegProcess.stderr.on('data', (data) => {
    console.error(`ffmpeg stderr: ${data}`);
  });

  ffmpegProcess.on('error', (error) => {
    console.error(`Error al iniciar ffmpeg: ${error.message}`);
    res.status(500).json({ error: 'Error al iniciar la transmisión' });
  });

  ffmpegProcess.on('exit', (code) => {
    console.log(`Proceso ffmpeg detenido con código: ${code}`);
  });

  res.json({ message: 'Transmisión iniciada' });
});

app.get('/check-manifest', (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.json({ exists: false, error: 'Usuario no autenticado.' });
  }
  const manifestPath = path.join(__dirname, `../stream/stream${userId}/manifest.mpd`);
  console.log("Comprobando archivo en ruta:", manifestPath);

  fs.access(manifestPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error("El archivo no existe:", err);
      res.json({ exists: false });
    } else {
      console.log("El archivo existe.");
      res.json({ exists: true });
    }
  });

});

app.post('/stop-stream', (req, res) => {
  if (ffmpegProcess) {
    // Enviar 'q' para que ffmpeg termine adecuadamente
    ffmpegProcess.stdin.write('q');
    ffmpegProcess.stdin.end(); // Finaliza la entrada estándar

    // Esperar a que el proceso termine
    ffmpegProcess.on('exit', (code) => {
      if (code === 0) {
        console.log('Proceso ffmpeg detenido correctamente con código:', code);
        res.status(200).send('Transmisión detenida correctamente');
      } else {
        console.error('Error al detener el proceso ffmpeg con código:', code);
        res.status(500).json({ error: 'Hubo un error al detener la transmisión' });
      }
    });

  } else {
    res.status(400).json({ error: 'No hay transmisión en curso' });
  }
});

// PANTALLA
app.post('/create-screen-folder', (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
      return res.status(401).json({ success: false, error: "El ID del usuario es requerido." });
  }

  const screenFolderPath = path.join(__dirname, `../stream/stream${userId}/screen${userId}`);

  // Crear la carpeta de pantalla
  fs.mkdir(screenFolderPath, { recursive: true }, (err) => {
      if (err) {
          console.error("Error al crear la carpeta de screen:", err);
          return res.status(500).json({ success: false, error: "No se pudo crear la carpeta de screen." });
      }

      console.log("Carpeta de screen creada exitosamente:", screenFolderPath);
      res.json({ success: true });
  });
});

app.delete('/delete-screen-folder', (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).son({ success: false, error: "El ID del usuario es requerido." });
  }

  const screenFolderPath = path.join(__dirname, `../stream/stream${userId}/screen${userId}`);

  // Eliminar la carpeta si existe
  fs.rm(screenFolderPath, { recursive: true, force: true }, (err) => {
    if (err) {
      console.error("Error al eliminar la carpeta:", err);
      return res.json({ success: false, error: "No se pudo eliminar la carpeta." });
    }

    console.log("Carpeta eliminada exitosamente:", screenFolderPath);
    res.json({ success: true });
  });
});

let FfmpegProcess = null;
app.post('/star-screen', (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).send('Usuario no autenticado');
  }

  const args =[
    '-f', 'gdigrab',
    '-framerate', '30',
    '-i', 'desktop',

    '-f', 'dshow',
    '-i', 'audio=Mezcla estéreo (Realtek High Definition Audio)',

    // Mapeo de video con escalado directo y configuraciones de bitrate
    '-map', '0:v', '-c:v:0', 'libx264', '-b:v:0', '800k', '-s:v:0', '640x360', '-preset', 'superfast', '-g', '30', '-keyint_min', '30',
    '-map', '0:v', '-c:v:1', 'libx264', '-b:v:1', '2500k', '-s:v:1', '1280x720', '-preset', 'superfast', '-g', '30', '-keyint_min', '30',
    '-map', '0:v', '-c:v:2', 'libx264', '-b:v:2', '5000k', '-s:v:2', '1920x1080', '-preset', 'superfast', '-g', '30', '-keyint_min', '30',

    // Mapeo de audio
    '-map', '1:a', '-c:a', 'aac', '-b:a', '128k',

    // Configuración para DASH
    '-f', 'dash',
    '-seg_duration', '4',
    '-use_template', '0',
    '-use_timeline', '1',
    '-window_size', '5',
    '-adaptation_sets', 'id=0,streams=v id=1,streams=a',
    `stream/stream${userId}/screen${userId}/manifest.mpd`
  ];

  FfmpegProcess = spawn(ffmpegPath, args);

  FfmpegProcess.on('close', (code) => {
      console.log(`FFmpeg salió con código: ${code}`);
      FfmpegProcess = null;
  });

  res.send('Captura iniciada.');
});

app.get('/checkManifest', (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.json({ exists: false, error: 'Usuario no autenticado.' });
  }

  const manifestPath = path.join(__dirname, `../stream/stream${userId}/screen${userId}/manifest.mpd`);
  console.log("Comprobando archivo en ruta:", manifestPath);

  fs.access(manifestPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error("El archivo no existe:", err);
      res.json({ exists: false });
    } else {
      console.log("El archivo existe.");
      res.json({ exists: true });
    }
  });
});

app.post('/stop-screen', (req, res) => {

});