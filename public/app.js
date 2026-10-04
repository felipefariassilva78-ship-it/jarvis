(() => {
  'use strict';

  const STORAGE_KEY = 'jarvis-assistant-v1';
  const $ = selector => document.querySelector(selector);
  const refs = {
    sidebar: $('#sidebar'),
    mobileScrim: $('#mobileScrim'),
    mobileMenuButton: $('#mobileMenuButton'),
    newChatButton: $('#newChatButton'),
    conversationList: $('#conversationList'),
    recentCount: $('#recentCount'),
    welcomeView: $('#welcomeView'),
    messages: $('#messages'),
    conversationScroll: $('#conversationScroll'),
    chatForm: $('#chatForm'),
    userInput: $('#userInput'),
    sendButton: $('#sendButton'),
    micButton: $('#micButton'),
    webSearchToggle: $('#webSearchToggle'),
    webSearchState: $('#webSearchState'),
    connectionPill: $('#connectionPill'),
    connectionLabel: $('#connectionLabel'),
    systemTag: $('#systemTag'),
    systemDescription: $('#systemDescription'),
    availabilityValue: $('#availabilityValue'),
    availabilityBar: $('#availabilityBar'),
    aiState: $('#aiState'),
    voiceState: $('#voiceState'),
    sidebarStatus: $('#sidebarStatus'),
    localTime: $('#localTime'),
    localDate: $('#localDate'),
    speechToggle: $('#speechToggle'),
    speechToggleLabel: $('#speechToggleLabel'),
    wakeToggle: $('#wakeToggle'),
    wakeToggleLabel: $('#wakeToggleLabel'),
    wakeCardButton: $('#wakeCardButton'),
    wakeCardState: $('#wakeCardState'),
    miniWakeButton: $('#miniWakeButton'),
    voiceCard: $('.voice-card'),
    aboutButton: $('#aboutButton'),
    aboutDialog: $('#aboutDialog'),
    toastRegion: $('#toastRegion')
  };

  function loadSavedState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        conversations: Array.isArray(parsed.conversations) ? parsed.conversations.filter(c => c && typeof c.id === 'string' && Array.isArray(c.messages)).slice(0, 30) : [],
        activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
        voiceReplies: typeof parsed.voiceReplies === 'boolean' ? parsed.voiceReplies : true
      };
    } catch {
      return { conversations: [], activeId: null, voiceReplies: true };
    }
  }

  const savedState = loadSavedState();
  let conversations = savedState.conversations;
  let activeId = conversations.some(c => c.id === savedState.activeId) ? savedState.activeId : null;
  let voiceReplies = savedState.voiceReplies;
  let webSearchOn = false;
  let isBusy = false;
  let busyConversationId = null;
  let wakeModeOn = false;
  let awaitingCommand = false;
  let recognition = null;
  let currentVoiceMode = null;
  let isRecognizing = false;
  let speechBusy = false;
  let wakeRestartTimer = null;
  let toastTimer = null;

  function activeConversation() {
    return conversations.find(conversation => conversation.id === activeId) || null;
  }

  function saveState() {
    try {
      conversations = conversations
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 30);
      if (!conversations.some(conversation => conversation.id === activeId)) activeId = null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ conversations, activeId, voiceReplies }));
    } catch {
      showToast('Não foi possível salvar o histórico neste navegador.', 'error');
    }
  }

  function createConversation(firstMessage) {
    const conversation = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title: firstMessage.trim().replace(/\s+/g, ' ').slice(0, 42) || 'Nova conversa',
      messages: [],
      updatedAt: Date.now()
    };
    if (firstMessage.trim().length > 42) conversation.title = `${conversation.title.slice(0, 39)}…`;
    conversations.unshift(conversation);
    activeId = conversation.id;
    return conversation;
  }

  function renderHistory() {
    refs.conversationList.replaceChildren();
    const ordered = [...conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    refs.recentCount.textContent = String(ordered.length).padStart(2, '0');
    if (!ordered.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'Suas conversas aparecem aqui.';
      refs.conversationList.append(empty);
      return;
    }

    for (const conversation of ordered.slice(0, 12)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `history-item${conversation.id === activeId ? ' selected' : ''}`;
      button.title = conversation.title || 'Conversa';
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 20 20');
      icon.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M4 4.5h12v8H9l-4.5 3v-11zM7 7.5h6M7 9.8h4');
      icon.append(path);
      const label = document.createElement('span');
      label.textContent = conversation.title || 'Conversa';
      button.append(icon, label);
      button.addEventListener('click', () => {
        activeId = conversation.id;
        saveState();
        renderHistory();
        renderConversation();
        closeMobileMenu();
      });
      refs.conversationList.append(button);
    }
  }

  function makeMessageElement(message, index) {
    const row = document.createElement('article');
    row.className = `message-row ${message.role === 'user' ? 'user' : 'assistant'}`;
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = message.role === 'user' ? 'EU' : 'J';

    const body = document.createElement('div');
    body.className = 'message-body';
    const head = document.createElement('div');
    head.className = 'message-head';
    const name = document.createElement('span');
    name.textContent = message.role === 'user' ? 'Você' : 'JARVIS';
    const time = document.createElement('time');
    if (message.createdAt) {
      time.dateTime = new Date(message.createdAt).toISOString();
      time.textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt));
    } else {
      time.textContent = '';
    }
    head.append(name, time);

    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = message.content;
    body.append(head, text);

    if (message.role === 'assistant' && Array.isArray(message.sources) && message.sources.length) {
      const sourceList = document.createElement('div');
      sourceList.className = 'source-list';
      const sourceHeading = document.createElement('span');
      sourceHeading.className = 'source-heading';
      sourceHeading.textContent = 'FONTES CONSULTADAS';
      sourceList.append(sourceHeading);
      message.sources.slice(0, 5).forEach((source, sourceIndex) => {
        try {
          const safeUrl = new URL(source.url);
          if (!['http:', 'https:'].includes(safeUrl.protocol)) return;
          const link = document.createElement('a');
          link.className = 'source-link';
          link.href = safeUrl.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.title = safeUrl.href;
          const number = document.createElement('span');
          number.className = 'source-index';
          number.textContent = `[${sourceIndex + 1}]`;
          const title = document.createElement('span');
          title.className = 'source-title';
          title.textContent = typeof source.title === 'string' ? source.title : safeUrl.hostname;
          link.append(number, title);
          sourceList.append(link);
        } catch { /* ignora URLs inválidas na resposta */ }
      });
      if (sourceList.children.length > 1) body.append(sourceList);
    }

    if (message.role === 'assistant' && !message.pending) {
      const tools = document.createElement('div');
      tools.className = 'message-tools';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'copy-button';
      copy.setAttribute('aria-label', 'Copiar resposta');
      copy.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="9" rx="1.3"/><path d="M10.5 5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1H5"/></svg><span>Copiar</span>';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(message.content);
          copy.querySelector('span').textContent = 'Copiado';
          setTimeout(() => { if (copy.isConnected) copy.querySelector('span').textContent = 'Copiar'; }, 1200);
        } catch {
          showToast('Não foi possível copiar. Selecione o texto da resposta.', 'error');
        }
      });
      tools.append(copy);
      body.append(tools);
    }
    row.append(avatar, body);
    return row;
  }

  function makeTypingElement() {
    const row = document.createElement('article');
    row.className = 'message-row assistant';
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'J';
    avatar.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    body.className = 'message-body';
    const head = document.createElement('div');
    head.className = 'message-head';
    const name = document.createElement('span');
    name.textContent = 'JARVIS';
    head.append(name);
    const dots = document.createElement('div');
    dots.className = 'typing-dots';
    dots.setAttribute('aria-label', 'JARVIS está pensando');
    dots.innerHTML = '<i></i><i></i><i></i>';
    body.append(head, dots);
    row.append(avatar, body);
    return row;
  }

  function renderConversation() {
    const conversation = activeConversation();
    const messages = conversation ? conversation.messages : [];
    const hasMessages = messages.length > 0;
    refs.welcomeView.hidden = hasMessages;
    refs.messages.hidden = !hasMessages;
    refs.messages.replaceChildren();
    if (!hasMessages) return;
    messages.forEach((message, index) => refs.messages.append(makeMessageElement(message, index)));
    if (isBusy && busyConversationId === activeId) refs.messages.append(makeTypingElement());
    requestAnimationFrame(() => { refs.conversationScroll.scrollTop = refs.conversationScroll.scrollHeight; });
  }

  function showToast(message, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast${type ? ` ${type}` : ''}`;
    toast.textContent = message;
    refs.toastRegion.append(toast);
    setTimeout(() => toast.remove(), 4800);
  }

  function closeMobileMenu() {
    refs.sidebar.classList.remove('open');
    refs.mobileScrim.classList.remove('visible');
  }

  function startNewConversation() {
    activeId = null;
    saveState();
    renderHistory();
    renderConversation();
    refs.userInput.focus();
    closeMobileMenu();
  }

  function resizeInput() {
    refs.userInput.style.height = 'auto';
    refs.userInput.style.height = `${Math.min(refs.userInput.scrollHeight, 150)}px`;
  }

  function setBusy(value, conversationId = null) {
    isBusy = value;
    busyConversationId = value ? conversationId : null;
    refs.sendButton.disabled = value;
    refs.sendButton.setAttribute('aria-label', value ? 'JARVIS está respondendo' : 'Enviar mensagem');
    refs.chatForm.classList.toggle('is-busy', value);
    renderConversation();
  }

  async function sendMessage(text = refs.userInput.value, options = {}) {
    const content = String(text || '').trim();
    if (!content || isBusy) return;
    let conversation = activeConversation();
    if (!conversation) conversation = createConversation(content);
    const targetId = conversation.id;
    conversation.messages.push({ role: 'user', content, createdAt: Date.now() });
    conversation.updatedAt = Date.now();
    refs.userInput.value = '';
    resizeInput();
    saveState();
    renderHistory();
    renderConversation();
    setBusy(true, targetId);

    try {
      const apiMessages = conversation.messages.map(message => {
        let messageContent = message.content;
        if (message.role === 'assistant' && Array.isArray(message.sources) && message.sources.length) {
          const sourceNotes = message.sources.map((source, index) => `[${index + 1}] ${source.title} — ${source.url}`).join('\n');
          messageContent += `\n\nFontes da resposta anterior:\n${sourceNotes}`;
        }
        return { role: message.role, content: messageContent };
      });
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, webSearch: webSearchOn })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Erro ao consultar o assistente (${response.status}).`);
      const reply = typeof data.reply === 'string' ? data.reply : 'Não recebi uma resposta válida. Tente novamente.';
      conversation.messages.push({
        role: 'assistant',
        content: reply,
        sources: Array.isArray(data.sources) ? data.sources.slice(0, 5) : [],
        createdAt: Date.now()
      });
      conversation.updatedAt = Date.now();
      saveState();
      if (voiceReplies && (options.viaVoice || !options.silent)) speakText(reply);
    } catch (error) {
      const errorMessage = error && error.message ? error.message : 'Não consegui conectar ao assistente. Verifique sua conexão e tente de novo.';
      conversation.messages.push({ role: 'assistant', content: `Não consegui responder agora. ${errorMessage}`, createdAt: Date.now(), error: true });
      conversation.updatedAt = Date.now();
      saveState();
      showToast(errorMessage, 'error');
    } finally {
      setBusy(false);
      renderHistory();
      if (activeId === targetId) renderConversation();
      closeMobileMenu();
    }
  }

  function updateClock() {
    const now = new Date();
    refs.localTime.textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(now);
    refs.localDate.textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  }

  async function checkHealth() {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error('Servidor indisponível');
      refs.webSearchState.textContent = data.webSearchConfigured ? 'Disponível' : 'Adicionar chave';
      refs.webSearchState.className = data.webSearchConfigured ? 'capability-state state-ready' : 'capability-state state-error';
      if (data.aiConfigured) {
        refs.connectionPill.classList.add('connected');
        refs.connectionPill.classList.remove('needs-key');
        refs.connectionLabel.textContent = 'IA conectada';
        refs.systemTag.textContent = 'ONLINE';
        refs.systemDescription.textContent = data.webSearchConfigured ? 'Assistente de IA, busca pública e clima prontos para uso.' : 'IA e clima prontos. Configure busca web para consultar fontes públicas atuais.';
        refs.availabilityValue.textContent = data.webSearchConfigured ? '100%' : '75%';
        refs.availabilityBar.style.width = data.webSearchConfigured ? '100%' : '75%';
        refs.aiState.textContent = 'Pronta';
        refs.aiState.className = 'capability-state state-ready';
        refs.sidebarStatus.textContent = 'Online · ' + (data.model || 'IA conectada');
      } else {
        refs.connectionPill.classList.add('needs-key');
        refs.connectionLabel.textContent = 'Configure a IA';
        refs.systemTag.textContent = 'CONFIGURAÇÃO PENDENTE';
        refs.systemDescription.textContent = data.webSearchConfigured ? 'Clima e busca pública disponíveis. Adicione uma chave de IA para respostas conversacionais.' : 'Clima pronto. Configure as chaves de IA e busca web para ativar todos os recursos.';
        refs.availabilityValue.textContent = data.webSearchConfigured ? 'CLIMA + WEB' : 'CLIMA OK';
        refs.availabilityBar.style.width = data.webSearchConfigured ? '55%' : '35%';
        refs.aiState.textContent = 'Adicionar chave';
        refs.aiState.className = 'capability-state state-error';
        refs.sidebarStatus.textContent = 'Configure a chave de IA';
      }
    } catch {
      refs.connectionPill.classList.remove('connected');
      refs.connectionPill.classList.add('needs-key');
      refs.connectionLabel.textContent = 'Servidor offline';
      refs.systemTag.textContent = 'OFFLINE';
      refs.systemDescription.textContent = 'Não foi possível alcançar o servidor do assistente.';
      refs.availabilityValue.textContent = 'OFFLINE';
      refs.availabilityBar.style.width = '0%';
      refs.aiState.textContent = 'Indisponível';
      refs.aiState.className = 'capability-state state-error';
      refs.webSearchState.textContent = 'Indisponível';
      refs.webSearchState.className = 'capability-state state-error';
      refs.sidebarStatus.textContent = 'Servidor indisponível';
    }
  }

  function setVoiceReplyState() {
    refs.speechToggle.setAttribute('aria-pressed', String(voiceReplies));
    refs.speechToggle.classList.toggle('is-off', !voiceReplies);
    refs.speechToggleLabel.textContent = voiceReplies ? 'Voz ligada' : 'Voz desligada';
    refs.speechToggle.title = voiceReplies ? 'Desativar leitura das respostas' : 'Ativar leitura das respostas';
  }

  function setWebSearchButtonState() {
    refs.webSearchToggle.classList.toggle('is-on', webSearchOn);
    refs.webSearchToggle.setAttribute('aria-pressed', String(webSearchOn));
    refs.webSearchToggle.setAttribute('aria-label', webSearchOn ? 'Desativar busca na web' : 'Ativar busca na web para esta pergunta');
    refs.webSearchToggle.title = webSearchOn ? 'Busca web ativada para as perguntas enviadas' : 'Pesquisar informações públicas na web';
    refs.webSearchToggle.querySelector('span').textContent = webSearchOn ? 'Busca ativa' : 'Busca web';
  }

  function setWakeUi(on) {
    wakeModeOn = on;
    refs.wakeToggle.classList.toggle('is-listening', on);
    refs.wakeToggle.setAttribute('aria-pressed', String(on));
    refs.wakeToggleLabel.textContent = on ? 'Escutando' : 'Hey Jarvis';
    refs.wakeCardButton.textContent = on ? 'Desativar voz' : 'Ativar voz';
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = on ? '×' : '↗';
    refs.wakeCardButton.append(arrow);
    refs.wakeCardState.textContent = on ? 'ATIVO' : 'DESATIVADO';
    refs.voiceCard.classList.toggle('is-listening', on);
    refs.miniWakeButton.setAttribute('aria-pressed', String(on));
    refs.miniWakeButton.setAttribute('aria-label', on ? 'Desativar modo mãos livres' : 'Ativar modo mãos livres');
  }

  function showBrowserSpeechAvailability() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const hasTts = 'speechSynthesis' in window;
    if (!SpeechRecognition) {
      refs.voiceState.textContent = 'Chrome / Edge';
      refs.voiceState.className = 'capability-state';
      return null;
    }
    refs.voiceState.textContent = hasTts ? 'Disponível' : 'Reconhecimento';
    refs.voiceState.className = 'capability-state state-ready';
    const instance = new SpeechRecognition();
    instance.lang = 'pt-BR';
    instance.continuous = false;
    instance.interimResults = false;
    instance.maxAlternatives = 1;

    instance.onstart = () => {
      isRecognizing = true;
      refs.micButton.classList.toggle('recording', currentVoiceMode === 'command');
      if (currentVoiceMode === 'command') refs.micButton.setAttribute('aria-label', 'Ouvindo...');
    };

    instance.onresult = event => {
      const result = event.results && event.results[event.results.length - 1];
      if (!result || !result[0]) return;
      const transcript = result[0].transcript.trim();
      if (!transcript) return;
      if (currentVoiceMode === 'wake' && wakeModeOn) {
        handleWakeTranscript(transcript);
      } else if (currentVoiceMode === 'command') {
        refs.userInput.value = transcript;
        resizeInput();
        sendMessage(transcript, { viaVoice: true });
      }
    };

    instance.onerror = event => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      const messages = {
        'not-allowed': 'Permita o acesso ao microfone nas configurações do navegador para usar a voz.',
        'service-not-allowed': 'O reconhecimento de voz está bloqueado neste navegador.',
        'audio-capture': 'Não encontrei um microfone disponível.',
        network: 'O serviço de reconhecimento de voz está indisponível. Tente novamente.'
      };
      showToast(messages[event.error] || 'Não consegui acessar o reconhecimento de voz.', 'error');
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setWakeUi(false);
        currentVoiceMode = null;
      }
    };

    instance.onend = () => {
      isRecognizing = false;
      refs.micButton.classList.remove('recording');
      refs.micButton.setAttribute('aria-label', 'Falar com o JARVIS');
      if (wakeModeOn && !speechBusy) scheduleWakeRestart();
    };
    return instance;
  }

  function scheduleWakeRestart(delay = 500) {
    clearTimeout(wakeRestartTimer);
    wakeRestartTimer = setTimeout(() => {
      if (!wakeModeOn || !recognition || isRecognizing || speechBusy) return;
      currentVoiceMode = 'wake';
      try { recognition.start(); } catch { /* O navegador já pode estar iniciando o reconhecimento. */ }
    }, delay);
  }

  function startWakeMode() {
    if (!recognition) {
      showToast('O reconhecimento de voz não está disponível. Abra este site no Chrome ou Edge e use HTTPS para ativar o microfone.', 'error');
      return;
    }
    clearTimeout(wakeRestartTimer);
    awaitingCommand = false;
    setWakeUi(true);
    currentVoiceMode = 'wake';
    try {
      recognition.start();
      showToast('Modo mãos livres ativado. Diga “Hey Jarvis” e depois seu comando.');
    } catch {
      setWakeUi(false);
      showToast('Não consegui iniciar o microfone. Tente novamente e confira as permissões do navegador.', 'error');
    }
  }

  function stopWakeMode() {
    setWakeUi(false);
    awaitingCommand = false;
    clearTimeout(wakeRestartTimer);
    if (currentVoiceMode === 'wake') currentVoiceMode = null;
    if (recognition && isRecognizing) {
      try { recognition.stop(); } catch { /* já parado */ }
    }
  }

  function toggleWakeMode() {
    if (wakeModeOn) stopWakeMode();
    else startWakeMode();
  }

  function wakePhraseRemainder(text) {
    const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const match = /(?:hey|ei|e\s+ai|ok(?:ay)?|ola)?\s*jarvis\b/i.exec(normalized);
    if (!match) return null;
    return text.slice(match.index + match[0].length).replace(/^[\s,.:;!?-]+/, '').trim();
  }

  function handleWakeTranscript(transcript) {
    const command = wakePhraseRemainder(transcript);
    if (command !== null) {
      if (command) {
        awaitingCommand = false;
        sendMessage(command, { viaVoice: true });
      } else {
        awaitingCommand = true;
        showToast('Estou ouvindo. Pode falar seu comando.');
      }
      return;
    }
    if (awaitingCommand) {
      awaitingCommand = false;
      sendMessage(transcript, { viaVoice: true });
    }
  }

  function startOneShotVoice() {
    if (!recognition) {
      showToast('O microfone depende do reconhecimento de voz do navegador. Tente Chrome ou Edge em uma página HTTPS.', 'error');
      return;
    }
    if (wakeModeOn) {
      setWakeUi(false);
      awaitingCommand = false;
      clearTimeout(wakeRestartTimer);
      try { if (isRecognizing) recognition.stop(); } catch { /* já parado */ }
    }
    const begin = () => {
      currentVoiceMode = 'command';
      try { recognition.start(); }
      catch { showToast('O microfone já está em uso. Aguarde um instante e tente novamente.', 'error'); }
    };
    if (isRecognizing) {
      try { recognition.stop(); } catch { /* já parado */ }
      setTimeout(begin, 250);
    } else {
      begin();
    }
  }

  function speakText(text) {
    if (!voiceReplies || !('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 3500));
    utterance.lang = 'pt-BR';
    utterance.rate = 1;
    utterance.pitch = 0.97;
    const voices = window.speechSynthesis.getVoices();
    const portugueseVoice = voices.find(voice => voice.lang && voice.lang.toLowerCase().startsWith('pt-br')) || voices.find(voice => voice.lang && voice.lang.toLowerCase().startsWith('pt'));
    if (portugueseVoice) utterance.voice = portugueseVoice;
    speechBusy = true;
    if (wakeModeOn && isRecognizing && currentVoiceMode === 'wake') {
      try { recognition.stop(); } catch { /* já parado */ }
    }
    utterance.onend = () => {
      speechBusy = false;
      if (wakeModeOn) scheduleWakeRestart(650);
    };
    utterance.onerror = () => {
      speechBusy = false;
      if (wakeModeOn) scheduleWakeRestart(650);
    };
    window.speechSynthesis.speak(utterance);
  }

  refs.newChatButton.addEventListener('click', startNewConversation);
  refs.chatForm.addEventListener('submit', event => {
    event.preventDefault();
    sendMessage();
  });
  refs.userInput.addEventListener('input', resizeInput);
  refs.userInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      refs.chatForm.requestSubmit();
    }
  });
  document.querySelectorAll('[data-prompt]').forEach(button => {
    button.addEventListener('click', () => sendMessage(button.getAttribute('data-prompt')));
  });
  refs.micButton.addEventListener('click', startOneShotVoice);
  [refs.wakeToggle, refs.wakeCardButton, refs.miniWakeButton].forEach(button => button.addEventListener('click', toggleWakeMode));
  refs.speechToggle.addEventListener('click', () => {
    voiceReplies = !voiceReplies;
    setVoiceReplyState();
    saveState();
    showToast(voiceReplies ? 'Leitura das respostas ativada.' : 'Leitura das respostas desativada.');
  });
  refs.webSearchToggle.addEventListener('click', () => {
    webSearchOn = !webSearchOn;
    setWebSearchButtonState();
    showToast(webSearchOn ? 'Busca pública na web ativada. O JARVIS não acessa suas abas nem seu histórico.' : 'Busca web desativada. Perguntas sobre informações recentes ainda podem ativá-la automaticamente.');
  });
  refs.mobileMenuButton.addEventListener('click', () => {
    refs.sidebar.classList.add('open');
    refs.mobileScrim.classList.add('visible');
  });
  refs.mobileScrim.addEventListener('click', closeMobileMenu);
  refs.aboutButton.addEventListener('click', () => refs.aboutDialog.showModal());
  $('#assistantNav').addEventListener('click', () => {
    if (!activeConversation()) renderConversation();
    closeMobileMenu();
  });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      startNewConversation();
    }
    if (event.key === 'Escape') closeMobileMenu();
  });

  setVoiceReplyState();
  setWebSearchButtonState();
  renderHistory();
  renderConversation();
  updateClock();
  setInterval(updateClock, 30_000);
  recognition = showBrowserSpeechAvailability();
  checkHealth();
})();
