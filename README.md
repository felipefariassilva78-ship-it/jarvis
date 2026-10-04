# JARVIS — assistente pessoal

Aplicação web responsiva em português, com conversa com um modelo de IA, busca de informações públicas na web com fontes, comandos por voz no navegador e consulta de clima atual por cidade. O servidor é Node.js puro, sem dependências de runtime.

## O que já funciona

- Chat com contexto da conversa, histórico salvo localmente no navegador e botão para copiar respostas.
- Comandos de voz pelo botão do microfone e modo mãos livres ativado manualmente: clique em **Hey Jarvis**, permita o microfone e diga “Hey Jarvis” seguido do pedido.
- Leitura das respostas em voz alta, que pode ser desligada no topo.
- Busca web acionada pelo botão **Busca web** ou automaticamente em perguntas com termos de atualidade (por exemplo, notícias, preço ou “hoje”); respostas mostram links das fontes consultadas.
- Clima atual sem chave de API: temperatura, sensação térmica, umidade, vento e condição, consultados no Open-Meteo.
- Interface adaptável para celular e desktop.
- Chaves de IA e busca guardadas no servidor, fora do código enviado ao navegador.

> A busca consulta informações públicas na internet e não lê abas, histórico, favoritos ou outros dados pessoais do navegador. As buscas web precisam de `TAVILY_API_KEY`; sem ela, perguntas que dependem de pesquisa atual mostram um aviso de configuração. O assistente usa o provedor de IA configurado por você, não controla dispositivos físicos e não garante resposta para literalmente todas as perguntas.

## Rodar no computador

Requer Node.js 18 ou superior.

```bash
cd jarvis-assistant
cp .env.example .env
```

Abra `.env` e configure `OPENAI_API_KEY` para o chat e `TAVILY_API_KEY` para busca na web. A busca é opcional; sem a chave Tavily, o chat normal e o clima continuam funcionando. Depois:

```bash
npm start
```

Acesse **http://localhost:3000**. O clima funciona sem a chave; o chat de IA precisa dela. O servidor também pode ler as variáveis diretamente do ambiente, sem arquivo `.env`.

### Configuração do provedor

- `OPENAI_API_KEY` — chave secreta da API; não compartilhe nem faça commit do arquivo `.env`.
- `OPENAI_MODEL` — modelo liberado para sua conta (o exemplo usa `gpt-4o-mini`).
- `OPENAI_BASE_URL` — opcional; por padrão usa `https://api.openai.com/v1`. Pode apontar para outro provedor **compatível com a API Chat Completions da OpenAI**, usando a URL-base e o nome de modelo desse provedor.
- `TAVILY_API_KEY` — chave privada do serviço de busca Tavily. O JARVIS usa essa chave no servidor quando você ativa Busca web ou pergunta sobre algo que parece atual; os links encontrados são exibidos junto da resposta.
- `PORT` — porta HTTP; a hospedagem normalmente define esse valor automaticamente.

O uso das APIs pode estar sujeito a cobrança e limites conforme os provedores. Confira as condições das suas contas antes de publicar.

## Publicar na internet com Render

O repositório já inclui `render.yaml` para facilitar a configuração.

1. Crie um repositório Git **privado** no GitHub. No terminal, dentro desta pasta, envie o projeto (troque a URL pelo repositório que você criou):

   ```bash
   git init
   git add .
   git commit -m "Criar assistente JARVIS"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   git push -u origin main
   ```

   O `.gitignore` exclui `.env`; confira que nenhuma chave real foi adicionada ao repositório.
2. No Render, escolha **New → Blueprint** e conecte o repositório.
3. Quando solicitado, informe `OPENAI_API_KEY` como variável secreta e, para habilitar pesquisa, `TAVILY_API_KEY` também como variável secreta. Mantenha `OPENAI_MODEL` conforme o modelo disponível na sua conta.
4. Aguarde o deploy e abra o endereço HTTPS fornecido pelo Render.
5. Teste o chat e permita o microfone no navegador. Para o recurso de voz em produção, use HTTPS; navegadores também podem limitar o reconhecimento de fala conforme o dispositivo e o idioma.

Se preferir configurar um Web Service manualmente: runtime **Node**, comando de build `npm install`, comando de início `npm start`, e as mesmas variáveis de ambiente. Também há um `Dockerfile` para hospedagens com suporte a contêineres. Consulte limites, disponibilidade e eventuais custos do plano escolhido no próprio provedor de hospedagem.

## Voz e privacidade

O reconhecimento e a síntese de fala são recursos do navegador (compatibilidade varia; Chrome/Edge costumam oferecer suporte ao reconhecimento em português). O navegador pode usar seu próprio serviço de reconhecimento de fala; este aplicativo não grava nem salva áudio. As mensagens são enviadas ao provedor de IA configurado e ficam no `localStorage` do navegador. Quando uma busca web é pedida ou ativada automaticamente, a pergunta é enviada à API Tavily e os resultados são usados como contexto para a IA. Nenhuma aba ou histórico do usuário é lido. A consulta de clima usa os serviços públicos do Open-Meteo.
