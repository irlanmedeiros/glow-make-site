#!/usr/bin/env bash
#
# Converte uma pasta de fotos para WebP, no tamanho que a vitrine usa.
#
# Serve para preparar fotos em lote fora do admin — por exemplo quando a
# cliente manda tudo de uma vez por WhatsApp. O admin ja converte sozinho uma
# por uma; isto e para quando sao dezenas.
#
# Uso:
#   scripts/otimizar-fotos.sh <pasta-de-entrada> <produtos|banners|depoimentos>
#
# Escreve em <pasta-de-entrada>/otimizadas/ e nunca altera os originais.
#
# Precisa do cwebp:  brew install webp

set -euo pipefail

ENTRADA="${1:-}"
TIPO="${2:-produtos}"

if [ -z "$ENTRADA" ] || [ ! -d "$ENTRADA" ]; then
  echo "uso: $0 <pasta-de-entrada> <produtos|banners|depoimentos>" >&2
  exit 1
fi

# Mesmos limites de src/lib/imagem.ts (LADO_MAXIMO). Se mudarem la, mude aqui.
case "$TIPO" in
  produtos)    LADO=1400 ;;
  banners)     LADO=2400 ;;
  depoimentos) LADO=400 ;;
  *) echo "tipo invalido: $TIPO" >&2; exit 1 ;;
esac

if ! command -v cwebp >/dev/null 2>&1; then
  echo "cwebp nao encontrado. Instale com: brew install webp" >&2
  exit 1
fi

SAIDA="$ENTRADA/otimizadas"
mkdir -p "$SAIDA"

total=0
antes=0
depois=0
mantidos=0

# -resize com 0 na altura mantem a proporcao. So reduz: imagem menor que o
# limite passa sem ser esticada, porque esticar inventa pixel e pesa mais.
while IFS= read -r -d '' arquivo; do
  nome=$(basename "$arquivo")
  base="${nome%.*}"
  # Mesmo padrao de nome que caminhoPermitido aceita: a-z, 0-9 e hifen.
  limpo=$(echo "$base" \
    | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null || echo "$base")
  limpo=$(echo "$limpo" | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-50)
  [ -z "$limpo" ] && limpo="foto"

  destino="$SAIDA/$limpo.webp"
  n=1
  while [ -e "$destino" ]; do
    destino="$SAIDA/$limpo-$n.webp"
    n=$((n + 1))
  done

  if ! cwebp -quiet -q 82 -resize "$LADO" 0 "$arquivo" -o "$destino" 2>/dev/null; then
    echo "falhou: $nome" >&2
    continue
  fi

  a=$(stat -f%z "$arquivo")
  d=$(stat -f%z "$destino")

  # Foto que ja chega pequena e bem comprimida pode ENGORDAR em WebP: a
  # origem ja gastou o orcamento de qualidade dela. Nesse caso tenta uma
  # qualidade menor e, se ainda nao compensar, fica com o original — este
  # script nunca deve devolver arquivo maior do que recebeu.
  if [ "$d" -ge "$a" ]; then
    if cwebp -quiet -q 72 -resize "$LADO" 0 "$arquivo" -o "$destino" 2>/dev/null; then
      d=$(stat -f%z "$destino")
    fi
  fi

  if [ "$d" -ge "$a" ]; then
    rm -f "$destino"
    destino="$SAIDA/$limpo.${nome##*.}"
    cp "$arquivo" "$destino"
    d="$a"
    mantidos=$((mantidos + 1))
    printf '%-42s %6s KB  (ja estava melhor, mantido)\n' "$(basename "$destino")" "$((a / 1024))"
  else
    printf '%-42s %6s KB -> %6s KB\n' "$(basename "$destino")" "$((a / 1024))" "$((d / 1024))"
  fi

  antes=$((antes + a))
  depois=$((depois + d))
  total=$((total + 1))
done < <(find "$ENTRADA" -maxdepth 1 -type f \
  \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.heic' \) -print0)

if [ "$total" -eq 0 ]; then
  echo "nenhuma imagem encontrada em $ENTRADA" >&2
  exit 1
fi

echo
echo "$total fotos | $((antes / 1024)) KB -> $((depois / 1024)) KB"
[ "$mantidos" -gt 0 ] && echo "$mantidos ja estavam melhores e foram mantidas"
echo "em: $SAIDA"
