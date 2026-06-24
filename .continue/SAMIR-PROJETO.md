GITHUB DESKTOP

- Precisa funcionar nas 3 plataformas padrão hoje, Windows, MacOS e Linux (funcionando no Gnome com Debian Trixie).
- Vamos poder enxergar todos os repositórios em formato de lista ou algo do tipo.
- Mostrar todos os repositorios que possuem demandar (git status) para commit, ou que estão desatualizados precisando de pull.
- Logar com o ususario e selecionar qual ou quais os repositórios a fazer o clone, indicando uma pasta raiz ou individualizando a pasta para cada repositorio selecionado.
- Podendo tambem fazer o clone dos repostiroios do enterprise ou do corporativo e fazer o clone do repositorio do usuario.
- Poder fazer clone dos repositorios publicos com o nome do usuario, por exemplo, coloca o usuario, lista os repositorios publicos e seleciona os repositorios e as pastas que fará o clone.
- Poder agendar o push dos repositorios automaticamente, assim como um commit "padrão" caso haja arquivos pendente de commit, isso não é o certo, mas se o usuario quiser agendar isso, permitir essa configuracao.



DEMANDAS FUTURAS

- login centralizador, como no projeto sshvterm, onde o usuario vai poder controlar um github desktop remoto, caso tenha esquecido um push, poder orientar o push remotamente a partir de outro github desktop devidamente logado no github desktop e na mesma conta de usuario do push.


- push agendado, se algo conflitar, cria um branch com descricao breve ou data hora e faz o push nesta branch, para o usuario não ficar travado, mas vamos fazer isto só mediante flag 
  [] forçar o push em uma brnach caso haja conflito
  [] informar por email ou outra forma o usuario que teve problema no push


- status não esta bom
   o retorno é sempre ok
   eu fiz uma alteração em um arquivo e o status foi ok no status
   fiz o push e tambem foi ok o resultado

- fiz um push manual e encontrei arquivos commitados que o push do app não subiu, tenho que testar de novo, não posso garantir esta falha
