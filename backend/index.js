const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const AdmZip = require('adm-zip');
const { Octokit } = require("octokit");

const app = express();
const port = process.env.PORT || 3002;
const BASE_DIR = process.env.VERCEL ? '/tmp' : __dirname;

// Credenciais Supabase (Fornecidas pelo usuário)
const SUPABASE_URL = 'https://teca-admin-supabase.ly7t0m.easypanel.host/';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';
const SCHEMA = 'biblioteca_git';
const BUCKET_NAME = 'biblioteca-git-zips';

// Inicializa cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    db: { schema: SCHEMA }
});

const log = (msg) => {
    console.log(`[${new Date().toISOString()}] INFO: ${msg}`);
};
const logError = (msg, err) => {
    const errorMsg = err || '';
    console.error(`[${new Date().toISOString()}] ERROR: ${msg}`, errorMsg);
};

// Configurações Express
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Vercel Serverless: Strip '/api' prefix from requests so Express routes match correctly
app.use((req, res, next) => {
    if (req.url.startsWith('/api/')) {
        req.url = req.url.substring(4);
    } else if (req.url === '/api') {
        req.url = '/';
    }
    next();
});

// Diretório de previews (apenas para preview de ZIPs, criado sob demanda)
const previewsDir = path.join(BASE_DIR, 'storage', 'previews');

// Health check - não usa Supabase, serve para diagnosticar se o Express está vivo
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        env: process.env.VERCEL ? 'vercel' : 'local'
    });
});



// Middleware para injetar <base> no HTML do preview de forma mais inteligente
app.use('/preview-files/:id', (req, res, next) => {
    // No Express, quando usamos um path no .use, o req.path é relativo a esse path
    if (req.path.endsWith('.html')) {
        const id = req.params.id;
        const subPath = req.path; // Ex: /frontend/index.html
        const filePath = path.join(previewsDir, id, subPath);

        if (fs.existsSync(filePath)) {
            try {
                let content = fs.readFileSync(filePath, 'utf8');
                // O baseDir deve incluir o subpath do diretório
                const subDir = path.dirname(subPath);
                const baseDir = `/preview-files/${id}${subDir === '/' ? '' : subDir}/`;

                if (content.includes('<head>')) {
                    content = content.replace('<head>', `<head>\n    <base href="${baseDir}">`);
                } else {
                    content = `<base href="${baseDir}">\n` + content;
                }
                return res.send(content);
            } catch (e) {
                return next();
            }
        }
    }
    next();
});

app.use('/preview-files', express.static(previewsDir, {
    maxAge: '1d',
    setHeaders: (res) => res.set('Cache-Control', 'public, max-age=86400')
}));

// memoryStorage: ideal para serverless - sem dependência de disco
const upload = multer({ storage: multer.memoryStorage() });

// Webhook Receptor
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const projectName = req.body.project_name || 'Sem Nome';
        const folderName = req.body.folder_name || 'Geral';
        log(`Iniciando upload para Supabase: ${projectName} (Pasta: ${folderName})`);

        if (!req.file) {
            logError('Nenhum arquivo recebido');
            return res.status(400).json({ error: 'Arquivo não enviado' });
        }

        // 1. Lógica de Versionamento e Herança de Pasta (Consulta no Supabase)
        const { data: existingVersions, error: fetchError } = await supabase
            .from('versions')
            .select('version_number, folder_name, github_repo')
            .eq('project_name', projectName)
            .order('version_number', { ascending: false })
            .limit(1);

        if (fetchError) throw fetchError;

        let nextVersion = 1;
        let finalFolder = folderName; // Default da requisição

        if (existingVersions && existingVersions.length > 0) {
            nextVersion = existingVersions[0].version_number + 1;
            // "Sticky Folder": Se o projeto já existe, ignore o folder_name do body e mantenha na pasta atual
            finalFolder = existingVersions[0].folder_name;
            log(`Projeto explorado: herda pasta '${finalFolder}' da versão anterior.`);
        }
        const finalFileName = `${projectName}.v${nextVersion}.zip`;
        const storagePath = `${projectName}/${finalFileName}`;

        // 2. Upload para Supabase Storage
        log(`Subindo para Storage: ${storagePath}`);
        const fileBuffer = req.file.buffer; // memoryStorage: buffer direto, sem arquivo temporário
        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(storagePath, fileBuffer, {
                contentType: 'application/zip',
                upsert: true
            });

        if (uploadError) {
            throw uploadError;
        }

        // 3. Salva Registro no Banco de Dados
        log(`Salvando registro no banco: v${nextVersion}`);
        const { error: dbError } = await supabase
            .from('versions')
            .insert({
                project_name: projectName,
                version_number: nextVersion,
                filename: finalFileName,
                storage_path: storagePath,
                folder_name: finalFolder,
                github_repo: existingVersions?.[0]?.github_repo || null
            });

        if (dbError) throw dbError;

        log(`Sucesso: Versão ${nextVersion} salva no Supabase.`);

        res.json({
            message: 'Versão salva no Supabase com sucesso',
            project: projectName,
            version: nextVersion,
            file: finalFileName
        });
    } catch (error) {
        logError('Erro durante o processamento do upload:', error);
        res.status(500).json({ error: 'Erro interno no processamento' });
    }
});

// Listar Projetos (Apenas o registro mais recente por nome, para evitar duplicidade de pastas)
app.get('/projects', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('versions')
            .select('project_name, folder_name, github_repo, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const projectsMap = new Map();
        data.forEach(item => {
            if (!projectsMap.has(item.project_name)) {
                projectsMap.set(item.project_name, {
                    project_name: item.project_name,
                    folder_name: item.folder_name,
                    github_repo: item.github_repo,
                    created_at: item.created_at
                });
            }
        });

        res.json(Array.from(projectsMap.values()));
    } catch (error) {
        logError('Erro ao listar projetos:', error);
        res.status(500).json([]);
    }
});

// --- NOVOS ENDPOINTS DE GESTÃO DE PASTAS ---

// Listar pastas oficiais
app.get('/folders', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('folders')
            .select('*')
            .order('name');
        if (error) throw error;
        res.json(data);
    } catch (error) {
        logError('Erro ao listar pastas:', error);
        res.status(500).json([]);
    }
});

// Criar nova pasta
app.post('/folders', async (req, res) => {
    try {
        const { name } = req.body;
        const { data, error } = await supabase
            .from('folders')
            .insert([{ name }])
            .select();
        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        logError('Erro ao criar pasta:', error);
        res.status(500).json({ error: 'Erro ao criar pasta' });
    }
});

// Deletar pasta
app.delete('/folders/:name', async (req, res) => {
    try {
        const { name } = req.params;
        // 1. Desvincula projetos da pasta deletada (deixa sem categoria)
        await supabase
            .from('versions')
            .update({ folder_name: null })
            .eq('folder_name', name);

        // 2. Remove a pasta
        const { error } = await supabase
            .from('folders')
            .delete()
            .eq('name', name);

        if (error) throw error;
        res.json({ message: 'Pasta removida com sucesso' });
    } catch (error) {
        logError('Erro ao deletar pasta:', error);
        res.status(500).json({ error: 'Erro ao deletar pasta' });
    }
});

// Atualizar configurações do Cluster GitHub na pasta
app.patch('/folders/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const { github_user, github_token } = req.body;
        const { data, error } = await supabase
            .from('folders')
            .update({ github_user, github_token })
            .eq('name', name);
        if (error) throw error;
        res.json({ message: 'Configuração do cluster salva com sucesso' });
    } catch (error) {
        logError('Erro ao configurar cluster:', error);
        res.status(500).json({ error: 'Erro ao salvar configuração' });
    }
});

// Listar Repositórios Reais do GitHub para uma pasta
app.get('/folders/:name/github-repos', async (req, res) => {
    try {
        const { name } = req.params;
        log(`Buscando repos para a pasta: ${name}`);

        const { data: folder, error } = await supabase
            .from('folders')
            .select('github_token')
            .eq('name', name)
            .single();

        if (error || !folder?.github_token) {
            logError(`Token não encontrado para a pasta '${name}':`, error || 'Token Vazio');
            return res.json([]);
        }

        log(`Token encontrado para '${name}'. Iniciando Octokit...`);
        const octokit = new Octokit({ auth: folder.github_token });
        const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
            sort: 'updated',
            per_page: 100,
            visibility: 'all'
        });

        log(`Sucesso: ${repos.length} repositórios encontrados.`);
        res.json(repos.map(r => r.name));
    } catch (error) {
        logError('Erro catastrófico ao buscar repos do GitHub:', error.message);
        res.status(500).json([]);
    }
});

// Mover projeto para outra pasta (Drag & Drop)
app.patch('/projects/:name/move', async (req, res) => {
    try {
        const { name } = req.params;
        const { new_folder } = req.body;

        const { error } = await supabase
            .from('versions')
            .update({ folder_name: new_folder })
            .eq('project_name', name);

        if (error) throw error;
        res.json({ message: `Projeto ${name} movido para ${new_folder}` });
    } catch (error) {
        logError('Erro ao mover projeto:', error);
        res.status(500).json({ error: 'Erro ao mover projeto' });
    }
});

// Atualizar Nome do Repositório GitHub do projeto (em todas as versões)
app.patch('/projects/:name/repo', async (req, res) => {
    try {
        const { name } = req.params;
        const { github_repo } = req.body;

        const { error } = await supabase
            .from('versions')
            .update({ github_repo })
            .eq('project_name', name);

        if (error) throw error;
        res.json({ message: `Repositório do projeto ${name} atualizado para ${github_repo}` });
    } catch (error) {
        logError('Erro ao atualizar repositório do projeto:', error);
        res.status(500).json({ error: 'Erro ao atualizar repositório' });
    }
});

// Listar Versões
app.get('/projects/:name/versions', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('versions')
            .select('*')
            .eq('project_name', req.params.name)
            .order('version_number', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        logError('Erro ao listar versões:', error);
        res.status(500).json([]);
    }
});

// Download
app.get('/download/:id', async (req, res) => {
    try {
        const { data: version, error: fetchError } = await supabase
            .from('versions')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !version) throw new Error('Versão não encontrada');

        const { data, error: downloadError } = await supabase.storage
            .from(BUCKET_NAME)
            .download(version.storage_path);

        if (downloadError) throw downloadError;

        const buffer = Buffer.from(await data.arrayBuffer());
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${version.filename}"`);
        res.send(buffer);
    } catch (error) {
        logError('Erro no download:', error);
        res.status(500).send('Erro ao baixar arquivo');
    }
});

// --- LÓGICA DE PUSH PARA GITHUB (MULT-ACCOUNT) ---
app.post('/push-github', async (req, res) => {
    const { versionId } = req.body;
    try {
        log(`Iniciando Push para GitHub (Version ID: ${versionId})`);

        // 1. Busca os dados da versão e do projeto para achar a pasta
        const { data: v, error: vError } = await supabase
            .from('versions')
            .select('*, folder_name')
            .eq('id', versionId)
            .single();

        if (vError || !v) throw new Error('Versão não localizada no banco.');

        // 2. Busca credenciais da pasta (Cluster)
        const folderName = v.folder_name || 'Geral';
        const { data: folder, error: fError } = await supabase
            .from('folders')
            .select('*')
            .eq('name', folderName)
            .single();

        // Fallback: Se não tem entrada na pasta, dá erro (excepto Geral que pode não existir no banco)
        if (fError && folderName !== 'Geral') throw new Error(`Configuração do Cluster '${folderName}' não encontrada.`);

        const gitUser = folder?.github_user;
        const gitToken = folder?.github_token;

        if (!gitUser || !gitToken) throw new Error(`Credenciais do GitHub pendentes para a pasta '${folderName}'.`);

        // 3. Download do ZIP do Supabase
        const { data: zipData, error: dlError } = await supabase.storage
            .from(BUCKET_NAME)
            .download(v.storage_path);

        if (dlError) throw dlError;

        // 4. Preparação dos arquivos para o GitHub
        const zip = new AdmZip(Buffer.from(await zipData.arrayBuffer()));
        const zipEntries = zip.getEntries();

        const octokit = new Octokit({ auth: gitToken });

        // Prioriza github_repo se definido, senão usa o nome do projeto slugificado
        const repoName = (v.github_repo || v.project_name).toLowerCase().replace(/\s+/g, '-');

        log(`Enviando para o repositório ${gitUser}/${repoName}...`);

        // Verifica se repositório existe, senão cria
        try {
            await octokit.rest.repos.get({ owner: gitUser, repo: repoName });
        } catch (e) {
            log(`Repositório ${repoName} não existe. Criando...`);
            await octokit.rest.repos.createForAuthenticatedUser({ name: repoName, private: true });
        }

        // Fluxo de commit simplificado (via content API para cada arquivo)
        // Nota: Para projetos grandes, isso pode ser lento, mas para o Vault é o ideal pela integridade.
        for (const entry of zipEntries) {
            if (entry.isDirectory) continue;

            // Ignora node_modules se acidentalmente estiver no zip
            if (entry.entryName.includes('node_modules')) continue;

            const content = entry.getData().toString('base64');
            const pathOnGit = entry.entryName;

            try {
                // Tenta pegar o SHA do arquivo se ele existir para fazer o update
                let sha;
                try {
                    const { data: fileData } = await octokit.rest.repos.getContent({
                        owner: gitUser,
                        repo: repoName,
                        path: pathOnGit
                    });
                    sha = fileData.sha;
                } catch (e) { }

                await octokit.rest.repos.createOrUpdateFileContents({
                    owner: gitUser,
                    repo: repoName,
                    path: pathOnGit,
                    message: `Auto-deploy via Biblioteca Git Cloud - v${v.version_number}`,
                    content: content,
                    sha: sha
                });
            } catch (err) {
                logError(`Erro ao subir arquivo ${pathOnGit} para o GitHub`, err);
            }
        }

        log(`Push finalizado com sucesso: https://github.com/${gitUser}/${repoName}`);
        res.json({ success: true, url: `https://github.com/${gitUser}/${repoName}` });

    } catch (error) {
        logError('Falha no processo de GitHub Push:', error);
        res.status(500).json({ error: error.message });
    }
});

// Atualizar Notas/Favorito
// --- PREVIEW LOGIC (LIVE SNAPSHOT) ---

// Prepara o ZIP para ser visualizado (extrai se necessário)
app.get('/prepare-preview/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const targetDir = path.join(previewsDir, id);

        // Se já foi extraído, apenas retorna ok
        if (fs.existsSync(targetDir)) {
            // log(`Versão ${id} já em cache.`);
            return res.json({ status: 'ready', path: `/preview-files/${id}` });
        }

        log(`Preparando preview para versão ${id}...`);

        // 1. Busca versão no banco
        const { data: version, error: fetchError } = await supabase
            .from('versions')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !version) throw new Error('Versão não encontrada');

        // 2. Download do Storage
        const { data: zipData, error: downloadError } = await supabase.storage
            .from(BUCKET_NAME)
            .download(version.storage_path);

        if (downloadError) throw downloadError;

        // 3. Extração para pasta de Preview
        const buffer = Buffer.from(await zipData.arrayBuffer());

        // AdmZip às vezes falha com caminhos longos no Windows ou buffers vazios
        if (buffer.length === 0) {
            logError(`Versão ${id} está corrompida no Storage (0 bytes).`);
            return res.status(422).json({ error: 'Arquivo corrompido ou vazio no Storage. Por favor, gere uma nova versão.' });
        }

        const zip = new AdmZip(buffer);
        fs.mkdirSync(targetDir, { recursive: true });
        zip.extractAllTo(targetDir, true);

        log(`Preview pronto para Versão ${id} em: ${targetDir}`);
        res.json({ status: 'ready', path: `/preview-files/${id}` });

    } catch (error) {
        logError('Erro ao preparar preview:', error);
        res.status(500).json({ error: 'Erro ao extrair pacote' });
    }
});

// Endpoint para ajudar o frontend a achar o index.html (Busca recursiva básica)
app.get('/find-entry/:id', (req, res) => {
    const { id } = req.params;
    const base = path.join(previewsDir, id);

    if (!fs.existsSync(base)) return res.status(404).json({ error: 'Pasta não encontrada' });

    function findIndex(dir) {
        const files = fs.readdirSync(dir);
        if (files.includes('index.html')) return 'index.html';

        const prioritySubdirs = ['frontend', 'public', 'src'];
        for (const sub of prioritySubdirs) {
            const fullSub = path.join(dir, sub);
            if (fs.existsSync(fullSub) && fs.statSync(fullSub).isDirectory()) {
                const found = findIndex(fullSub);
                if (found) return path.join(sub, found).replace(/\\/g, '/');
            }
        }

        for (const sub of files) {
            if (sub === 'node_modules' || sub.substring(0, 1) === '.' || sub === 'storage') continue;
            const fullSub = path.join(dir, sub);
            if (fs.statSync(fullSub).isDirectory()) {
                const found = findIndex(fullSub);
                if (found) return path.join(sub, found).replace(/\\/g, '/');
            }
        }
        return null;
    }

    const relativePath = findIndex(base);
    if (relativePath) {
        res.json({ entry: relativePath });
    } else {
        res.json({ entry: 'index.html' }); // Fallback
    }
});

// Endpoint: Buscar Qual a Versão Atual no GitHub
app.get('/projects/:name/github-version', async (req, res) => {
    try {
        const { name } = req.params;

        // Descobre a pasta do projeto e o repo customizado
        const { data: v } = await supabase
            .from('versions')
            .select('folder_name, github_repo')
            .eq('project_name', name)
            .order('version_number', { ascending: false })
            .limit(1)
            .single();

        if (!v) return res.json({ version: null });

        const folderName = v.folder_name || 'Geral';
        const { data: folder } = await supabase
            .from('folders')
            .select('github_user, github_token')
            .eq('name', folderName)
            .single();

        if (!folder || !folder.github_token) return res.json({ version: null });

        const repoName = (v.github_repo || name).toLowerCase().replace(/\s+/g, '-');
        const octokit = new Octokit({ auth: folder.github_token });

        // Busca o último commit
        const commits = await octokit.rest.repos.listCommits({
            owner: folder.github_user,
            repo: repoName,
            per_page: 1
        });

        const commitMessage = commits.data[0]?.commit?.message || '';
        const match = commitMessage.match(/- v(\d+)/i); // Extrai o "v26" da mensagem "Auto-deploy via Biblioteca Git Cloud - v26"

        if (match && match[1]) {
            res.json({ version: parseInt(match[1]) });
        } else {
            res.json({ version: null });
        }
    } catch (e) {
        res.json({ version: null }); // Falha silenciosa se repo n existe ou credentials errados
    }
});

app.patch('/versions/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('versions')
            .update(req.body)
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ message: 'Atualizado com sucesso' });
    } catch (error) {
        logError('Erro ao atualizar:', error);
        res.status(500).json({ error: 'Erro ao atualizar' });
    }
});

// Inicia o servidor apenas se não estiver no Vercel
if (!process.env.VERCEL) {
    app.listen(port, '0.0.0.0', () => {
        log(`[Biblioteca Git Cloud] Backend rodando em http://localhost:${port}`);
    });
}

module.exports = app;
