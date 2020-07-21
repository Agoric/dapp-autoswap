import harden from '@agoric/harden';

export default harden(({ board, publicAPI, inviteIssuer }, _inviteMaker) => {
   
  const cacheOfPromiseForValue = new Map();
  const getFromBoard = boardId => {
    let valueP = cacheOfPromiseForValue.get(boardId);
    if (!valueP) {
      // Cache miss, so try the board.
      valueP = E(board).getValue(boardId);
      cacheOfPromiseForValue.set(boardId, valueP);
    }
    return valueP;
  }

  // returns a promise
  const hydrateBrand = dehydratedBrand => getFromBoard(dehydratedBrand);
  
  // returns a promise
  const hydrateAmount = dehydratedAmount => {
    return hydrateBrand(dehydratedAmount.brand).then(brand => {
      return {
        brand,
        value: dehydratedAmount.value,
      };
    })
  };

  return harden({
    getCommandHandler() {
      return harden({
        onError(obj, _meta) {
          console.error('Have error', obj);
        },
        onOpen: (_obj, _meta) => {},
        onClose: (_obj, _meta) => {},
        async onMessage(obj, _meta) {
          const { type, data } = obj;
          switch (type) {
            case 'autoswap/getCurrentPrice': {
              const { 
                amountIn: dehydratedAmountIn,
                brandOut: dehydratedBrandOut
              } = data;

              // A dehydrated amount has the form: { brand:
              // brandBoardId, value }

              // dehydratedBrandOut is a brandBoardId
              const [amountIn, brandOut] = await Promise.all([
                hydrateAmount(dehydratedAmountIn), 
                hydrateBrand(dehydratedBrandOut)
              ]);
              const { value } = await E(publicAPI).getCurrentPrice(amountIn, brandOut);
              return { type: 'autoswap/getCurrentPriceResponse', data: value };
            }

            case 'autoswap/sendSwapInvite': {
              const { depositFacetId, offer } = obj.data;
              const depositFacet = E(board).getValue(depositFacetId);
              const invite = await E(publicAPI).makeSwapInvite();
              const inviteAmount = await E(inviteIssuer).getAmountOf(invite);
              const { value: [{ handle }]} = inviteAmount;
              const inviteHandleBoardId = await E(board).getId(handle);
              const updatedOffer = { ...offer, inviteHandleBoardId };
              E(depositFacet).receive(invite);
              
              return harden({
                type: 'autoswap/sendSwapInviteResponse',
                data: { offer: updatedOffer },
              });
            }

            default: {
              return false;
            }
          }
        },
      });
    },
  });
});
