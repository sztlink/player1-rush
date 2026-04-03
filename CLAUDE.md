# PLAYER 1: RUSH — Totem Speedrun

## Semantica da Expo

A exposicao Player 1 usa uma gramatica de verbos monossilabicos para nomear cada experiencia:

```
PLAYER 1: 50 Anos do Videogame
|
|- STRIKE       corpo ataca luz (Unity + body tracking)
|- DRIFT        corpo desvia objetos (Unity + body tracking)
|- TRACE        dedo explora acervo (touchscreen kiosk)
|- RUSH         maos executam sob pressao (totem CRT speedrun)
     |- RUN     plataforma / pular
     |- SHOOT   nave / atirar
     |- DRIVE   corrida / desviar
     |- FIGHT   luta / vencer
```

RUSH e seus 4 sub-jogos seguem a mesma convencao: **verbos que nomeiam o gesto, nao o conteudo visual.**

## O que e

Instalacao interativa com 2 torres de 4 TVs CRT cada. Cada TV roda um minigame. Jogador sobe pela torre completando os 4 games no menor tempo possivel (speedrun).

```
  +----------+
  |  FIGHT   |  CRT 4 (topo) - fighting 2D, confronto final
  +----------+
  |  DRIVE   |  CRT 3 - corrida pseudo-3D, desviar obstaculos
  +----------+
  |  SHOOT   |  CRT 2 - space shooter vertical, destruir inimigos
  +----------+
  |   RUN    |  CRT 1 (base) - plataforma, pular obstaculos
  +----------+
     TIMER
```

## Mapeamento de nomes

| Verbo publico | Mecanica | Arquivo fonte | Nome interno (dev) | Autor |
|---------------|----------|---------------|--------------------|-------|
| **RUN** | Plataforma / pular | `src/games/cyberrun.js` | CyberRun | Raphael Minhoso |
| **SHOOT** | Space shooter / atirar | `src/games/nave.js` | Nave | equipe AYA |
| **DRIVE** | Racing pseudo-3D / desviar | `src/games/corrida.js` | Corrida | equipe AYA |
| **FIGHT** | Fighting 2D / vencer | `src/games/luta.js` | Luta | equipe AYA |

Os nomes internos dos arquivos (cyberrun.js, nave.js, corrida.js, luta.js) sao nomes de desenvolvimento.
Os nomes publicos (RUN, SHOOT, DRIVE, FIGHT) sao os que aparecem na expo.

## Narrativa entre niveis

RUN termina com o personagem alcancando uma nave
-> SHOOT: pilota essa nave, enfrenta inimigos no espaco
-> nave pousa
-> DRIVE: pega um carro, corrida neon
-> carro chega ao destino
-> FIGHT: confronto final, 1v1

## Estrutura do projeto
```
app/
|- index.html              <- pagina principal (NAO EDITAR)
|- src/
|   |- main.js             <- entry point (NAO EDITAR)
|   |- orchestrator.js     <- maquina de estados, timer, transicoes (NAO EDITAR)
|   |- input.js            <- teclado + gamepad unificados (NAO EDITAR)
|   |- ranking.js          <- sistema de ranking
|   +- games/
|       |- interface.js    <- contrato MiniGame (referencia)
|       |- cyberrun.js     <- RUN - nivel 1 (Minhoso)
|       |- nave.js         <- SHOOT - nivel 2
|       |- corrida.js      <- DRIVE - nivel 3
|       +- luta.js         <- FIGHT - nivel 4
|- assets/cyberrun/        <- sprites e sons do RUN (CyberRun)
+- config/corners.json     <- corner pin (gerado na calibracao)
```

## Como rodar
```bash
npx serve . -p 3000
# Abre http://localhost:3000
# ENTER ou botao START pra comecar
# Setas pra mover, ESPACO/Z pra pular
```

## Regras para editar o CyberRun / RUN (src/games/cyberrun.js)

1. **NAO mudar os nomes das funcoes exportadas** (init, update, render, getState, renderIdle, reset, destroy) - o orquestrador depende delas
2. **NAO mudar o id** ('cyberrun') nem o difficulty (1)
3. **Canvas e 640x480** (4:3) - GROUND esta em 380
4. **getState()** deve retornar 'playing' enquanto o jogo roda e 'won' quando o jogador chega na nave
5. **Sem game over** - quando o jogador morre, respawna e continua. Timer nao para.
6. **Input** vem do objeto passado em init() - { left, right, up, down, buttonA, buttonB }
7. **Safe zone** - nao colocar informacao importante nos 50px de cada borda (overscan do CRT)
8. **Pode criar funcoes internas** a vontade - so nao mexer na interface exportada

## O que falta
- [ ] RUN (CyberRun): canvas 4:3, gamepad, attract mode, balancear duracao ~60-90s
- [ ] SHOOT (Nave): testar, balancear, attract mode
- [ ] DRIVE (Corrida): testar, balancear, attract mode
- [ ] FIGHT (Luta): testar, balancear, attract mode
- [ ] Adaptadores HDMI - Composto/S-Video para CRTs
- [ ] Gamepads/joysticks USB
- [ ] Estrutura metalica da torre
- [ ] Timer speedrun visivel (LED ou tela separada)
