const express = require('express');
const path = require('path');
const db = require('./config/db');
const session = require('express-session');
const multer = require('multer'); // Para upload de arquivos
const app = express();

// Middleware para interpretar o JSON no corpo das requisições
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurando o express-session
app.use(session({
    secret: 'seuSegredoAqui', // Defina um segredo seguro para criptografar a sessão
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // true em produção
        httpOnly: true // Aumenta a segurança do cookie
    }
}));

// Definir armazenamento para o Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Define o diretório onde as imagens serão salvas
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); // Define um nome único para cada arquivo
    }
});

// Serve arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Rota para a página de login
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Endpoint de login (sem bcrypt)
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Adiciona log para visualizar o que é enviado da view para o backend
    console.log('Dados recebidos no login:', req.body);

    if (!email || !password) {
        console.log('Campos faltando no login');
        return res.status(400).send('Preencha todos os campos.');
    }

    const cleanedEmail = email.trim();

    const query = 'SELECT * FROM usuarios WHERE email = ?';

    db.query(query, [cleanedEmail], (err, results) => {
        if (err) {
            console.error('Erro ao consultar o banco de dados:', err);
            return res.status(500).send('Erro ao consultar o banco de dados');
        }

        console.log('Resultado da consulta ao banco:', results);

        if (results.length > 0) {
            const user = results[0];

            // Verifica a senha diretamente (sem bcrypt)
            if (password === user.password) {
                console.log('Autenticação bem-sucedida para o usuário:', user.username);
                
                // Armazena o nome de usuário correto na sessão
                req.session.user = { username: user.username };
                
                // Certifica-se que a sessão está sendo salva
                req.session.save((err) => {
                    if (err) {
                        console.error('Erro ao salvar a sessão:', err);
                        return res.status(500).send('Erro ao salvar a sessão');
                    }
                    return res.redirect('/dashboard');
                });
            } else {
                console.log('Senha inválida');
                return res.status(401).send('Senha inválida');
            }
        } else {
            console.log('Email não encontrado');
            return res.status(401).send('Email não encontrado');
        }
    });
});


// Rota para o dashboard
app.get('/dashboard', (req, res) => {
    console.log('Usuário logado na sessão:', req.session.user);

    if (!req.session.user) {
        return res.redirect('/');
    }

    // Passa o nome do usuário para o HTML
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Endpoint para obter o nome do usuário logado
app.get('/api/getUser', (req, res) => {
    console.log('Requisição para obter o usuário logado:', req.session.user);

    if (req.session.user) {
        res.json({ username: req.session.user.username });
    } else {
        res.status(401).json({ message: 'Usuário não logado' });
    }
});

// Rota para buscar empresas e usuários do IFA
app.get('/api/data', (req, res) => {
    const companyQuery = 'SELECT id, nome_empresa FROM empresas';
    const ifaQuery = 'SELECT id, nome_completo FROM usuarios WHERE tipo_usuario = "admin"';

    const data = {};

    db.query(companyQuery, (err, companies) => {
        if (err) {
            console.error('Erro ao buscar empresas:', err);
            return res.status(500).send('Erro ao buscar empresas');
        }

        data.companies = companies;

        db.query(ifaQuery, (err, users) => {
            if (err) {
                console.error('Erro ao buscar usuários IFA:', err);
                return res.status(500).send('Erro ao buscar usuários IFA');
            }

            data.users = users;
            console.log('Dados das empresas e usuários:', data);
            res.json(data);
        });
    });
});

// Inicializando o Multer
const upload = multer({ storage: storage });

// Endpoint para cadastro de empresa com upload de foto
app.post('/api/registerCompany', upload.single('uploadPhoto'), (req, res) => {
    const { nome_empresa, email, whatsapp, cnpj, location } = req.body;
    const foto_empresa = req.file ? req.file.filename : null; // Verifica se o arquivo foi enviado

    const sql = 'INSERT INTO empresas (nome_empresa, email, whatsapp, cnpj, foto_empresa, localizacao) VALUES (?, ?, ?, ?, ?, ?)';
    
    db.query(sql, [nome_empresa, email, whatsapp, cnpj, foto_empresa, location], (error, results) => {
        if (error) {
            console.error('Erro ao cadastrar empresa:', error);
            return res.status(500).send('<script>alert("Erro ao cadastrar empresa"); window.location.href = "/registerCompanyPage";</script>');
        }
        res.status(200).send('<script>alert("Empresa cadastrada com sucesso!"); window.location.href = "/registerCompanyPage";</script>');
    });
});




// Rota para cadastrar uma visita
app.post('/api/register-visit', upload.single('report'), (req, res) => {
    console.log('Dados recebidos para registro de visita:', req.body);
    const { companyName, participants, ifaParticipants, duration, nextVisit } = req.body;
    const reportFile = req.file ? req.file.filename : null; // Recebe o PDF do frontend

    const query = 'INSERT INTO visitas (empresa_id, participantes_empresa, participantes_ifa, duracao, proxima_visita, relatorio_pdf) VALUES (?, ?, ?, ?, ?, ?)';
    const ifaParticipantsJson = JSON.stringify(ifaParticipants);

    db.query(query, [companyName, participants, ifaParticipantsJson, duration, nextVisit, reportFile], (err, result) => {
        if (err) {
            console.error('Erro ao cadastrar visita:', err);
            return res.status(500).send('Erro ao cadastrar visita');
        }

        console.log('Visita cadastrada com sucesso:', result);
        res.status(201).send('Visita cadastrada com sucesso!');
    });
});




// Iniciar o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
