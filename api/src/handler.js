import harden from '@agoric/harden';

export default harden(({ registry, publicAPI, brandPs, keywords }, _inviteMaker) => {

  const brandToKeyword = new Map();
  keywords.forEach(async (keyword, i) => {
    const brand = await brandPs[i];
    brandToKeyword.set(brand, keyword);
  });
   
  const cacheOfPromiseForValue = new Map();
  const getFromRegistry = registryKey => {
    let valueP = cacheOfPromiseForValue.get(registryKey);
    if (!valueP) {
      // Cache miss, so try the registry.
      valueP = E(registry).get(registryKey);
      cacheOfPromiseForValue.set(registryKey, valueP);
    }
    return valueP;
  }

  const getCurrentPrice = (amountIn, _brandOut) => {
    const keyword = brandToKeyword.get(amountIn.brand);
    return E(publicAPI).getCurrentPrice({ [keyword]: amountIn })
      .then(amount1 => amount1.extent);
  }

  // returns a promise
  const hydrateBrand = dehydratedBrand => getFromRegistry(dehydratedBrand);
  
  // returns a promise
  const hydrateAmount = dehydratedAmount => {
    return hydrateBrand(dehydratedAmount.brand).then(brand => {
      return {
        brand,
        extent: dehydratedAmount.extent,
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
            case 'autoswapGetCurrentPrice': {
              const { 
                amountIn: dehydratedAmountIn,
                brandOut: dehydratedBrandOut
              } = data;

              // A dehydrated amount has the form: { brand:
              // brandRegKey, extent }

              // dehydratedBrandOut is a brandRegKey
              const [amountIn, brandOut] = await Promise.all([
                hydrateAmount(dehydratedAmountIn), 
                hydrateBrand(dehydratedBrandOut)
              ]);
              const extent = await getCurrentPrice(amountIn, brandOut);
              return { type: 'autoswapGetCurrentPriceResponse', data: extent };
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
